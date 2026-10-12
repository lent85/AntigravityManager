import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';

import { isObservable, type Observable, type Subscription } from 'rxjs';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

import {
  OpenAIResponsesWebSocketProtocol,
  type OpenAIResponsesWebSocketAction,
  type OpenAIResponsesWebSocketEvent,
} from './openai-responses-websocket.protocol';

export interface OpenAIResponsesWebSocketServerDependencies {
  isAuthorized: (request: IncomingMessage) => boolean;
  streamRequest: (request: Record<string, unknown>) => Promise<Observable<unknown>>;
}

/**
 * Attaches the Codex Responses WebSocket transport to an existing HTTP server.
 * Non-Responses upgrades are left untouched for other upgrade listeners.
 */
export function attachOpenAIResponsesWebSocketServer(
  server: Server,
  dependencies: OpenAIResponsesWebSocketServerDependencies,
): () => void {
  const webSocketServer = new WebSocketServer({ noServer: true });
  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const pathname = resolvePathname(request.url);
    if (pathname !== '/v1/responses') {
      return;
    }
    if (!dependencies.isAuthorized(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request);
    });
  };

  webSocketServer.on('connection', (socket) => {
    handleConnection(socket, dependencies);
  });
  server.on('upgrade', handleUpgrade);

  return () => {
    server.off('upgrade', handleUpgrade);
    for (const client of webSocketServer.clients) {
      client.terminate();
    }
    webSocketServer.close();
  };
}

const MAX_QUEUED_MESSAGES = 64;
const MAX_QUEUED_BYTES = 4 * 1024 * 1024;
const MAX_BUFFERED_AMOUNT = 2 * 1024 * 1024;
const HEARTBEAT_INTERVAL_MS = 30_000;

function handleConnection(
  socket: WebSocket,
  dependencies: OpenAIResponsesWebSocketServerDependencies,
): void {
  const protocol = new OpenAIResponsesWebSocketProtocol();
  const activeSubscriptions = new Set<Subscription>();
  const laneQueues = new Map<string, Promise<void>>();
  const namedStreams = new Set<string>();
  const runWithConcurrencyLimit = createConcurrencyGate(16);
  const abortController = new AbortController();
  let isClosed = false;
  let queuedMessages = 0;
  let queuedBytes = 0;

  let isAlive = true;
  socket.on('pong', () => {
    isAlive = true;
  });
  const heartbeatTimer = setInterval(() => {
    if (isClosed || socket.readyState !== WebSocket.OPEN) {
      clearInterval(heartbeatTimer);
      return;
    }
    if (!isAlive) {
      socket.terminate();
      return;
    }
    isAlive = false;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);

  const cleanupConnection = (): void => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    clearInterval(heartbeatTimer);
    abortController.abort();
    for (const subscription of activeSubscriptions) {
      subscription.unsubscribe();
    }
    activeSubscriptions.clear();
    laneQueues.clear();
  };

  socket.once('close', cleanupConnection);
  socket.once('error', cleanupConnection);

  socket.on('message', (rawData) => {
    if (isClosed || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const payloadBytes = rawDataToByteLength(rawData);
    if (
      queuedMessages >= MAX_QUEUED_MESSAGES ||
      queuedBytes + payloadBytes > MAX_QUEUED_BYTES
    ) {
      sendWebSocketError(
        socket,
        new Error('WebSocket message queue limit exceeded: connection overloaded.'),
      );
      return;
    }

    let action: OpenAIResponsesWebSocketAction;
    try {
      const payload = parseClientPayload(rawData);
      action = protocol.accept(payload);
    } catch (error) {
      sendWebSocketError(socket, error);
      return;
    }

    if (action.streamId) {
      namedStreams.add(action.streamId);
      if (namedStreams.size > 32) {
        namedStreams.delete(action.streamId);
        sendWebSocketError(
          socket,
          new Error('A WebSocket connection supports at most 32 distinct stream_id values.'),
          action.streamId,
        );
        return;
      }
    }

    queuedMessages += 1;
    queuedBytes += payloadBytes;

    const laneKey = action.streamId ?? '__default__';
    const previous = laneQueues.get(laneKey) ?? Promise.resolve();
    const processing = previous
      .then(async () => {
        if (isClosed || abortController.signal.aborted) {
          return;
        }

        if (action.kind === 'local') {
          for (const event of action.events) {
            sendEvent(socket, event);
          }
          return;
        }

        await runWithConcurrencyLimit(async () => {
          if (isClosed || abortController.signal.aborted) {
            return;
          }
          const stream = await dependencies.streamRequest(action.request);
          if (isClosed || abortController.signal.aborted) {
            return;
          }
          if (!isObservable(stream)) {
            throw new Error('Responses WebSocket upstream did not return a stream');
          }
          const parseUpstreamChunk = createUpstreamEventParser();
          await new Promise<void>((resolve, reject) => {
            let subscription: Subscription | undefined;
            const onAbort = () => {
              subscription?.unsubscribe();
              reject(new Error('WebSocket connection closed'));
            };
            if (abortController.signal.aborted) {
              onAbort();
              return;
            }
            abortController.signal.addEventListener('abort', onAbort, { once: true });
            subscription = stream.subscribe({
              next: (chunk) => {
                if (isClosed || abortController.signal.aborted) {
                  subscription?.unsubscribe();
                  return;
                }
                for (const upstreamEvent of parseUpstreamChunk(chunk)) {
                  const event = addStreamId(upstreamEvent, action.streamId);
                  sendEvent(socket, event);
                  if (event.type === 'response.completed' || event.type === 'response.incomplete') {
                    protocol.complete(event.response, action.request);
                  }
                }
              },
              error: (err) => {
                abortController.signal.removeEventListener('abort', onAbort);
                reject(err);
              },
              complete: () => {
                abortController.signal.removeEventListener('abort', onAbort);
                resolve();
              },
            });
            activeSubscriptions.add(subscription);
            subscription.add(() => {
              activeSubscriptions.delete(subscription);
              abortController.signal.removeEventListener('abort', onAbort);
            });
          });
        }, abortController.signal);
      })
      .catch((error: unknown) => {
        if (!isClosed) {
          sendWebSocketError(socket, error, action.streamId);
        }
      })
      .finally(() => {
        queuedMessages = Math.max(0, queuedMessages - 1);
        queuedBytes = Math.max(0, queuedBytes - payloadBytes);
        if (laneQueues.get(laneKey) === processing) {
          laneQueues.delete(laneKey);
        }
      });

    laneQueues.set(laneKey, processing);
  });
}

function createConcurrencyGate(
  limit: number,
): <T>(operation: () => Promise<T>, signal?: AbortSignal) => Promise<T> {
  let active = 0;
  const waiting: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];

  return async <T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }
    if (active >= limit) {
      await new Promise<void>((resolve, reject) => {
        const waiter = { resolve, reject };
        const onAbort = () => {
          const idx = waiting.indexOf(waiter);
          if (idx !== -1) {
            waiting.splice(idx, 1);
          }
          reject(new Error('Operation aborted'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        waiting.push({
          resolve: () => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          },
          reject: (err) => {
            signal?.removeEventListener('abort', onAbort);
            reject(err);
          },
        });
      });
    }
    if (signal?.aborted) {
      waiting.shift()?.resolve();
      throw new Error('Operation aborted');
    }
    active += 1;
    try {
      return await operation();
    } finally {
      active -= 1;
      waiting.shift()?.resolve();
    }
  };
}

function parseClientPayload(rawData: RawData): unknown {
  try {
    const payload: unknown = JSON.parse(rawDataToString(rawData));
    return payload;
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createUpstreamEventParser(): (chunk: unknown) => OpenAIResponsesWebSocketEvent[] {
  let buffer = '';
  return (chunk: unknown): OpenAIResponsesWebSocketEvent[] => {
    if (typeof chunk !== 'string') {
      return isResponsesEvent(chunk) ? [chunk] : [];
    }

    buffer += chunk;
    const events: OpenAIResponsesWebSocketEvent[] = [];
    while (true) {
      const separator = /\r?\n\r?\n/.exec(buffer);
      if (!separator || separator.index === undefined) {
        break;
      }
      const block = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      const event = parseUpstreamEventBlock(block);
      if (event) {
        events.push(event);
      }
    }
    return events;
  };
}

function parseUpstreamEventBlock(block: string): OpenAIResponsesWebSocketEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n');
  if (!data || data === '[DONE]') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(data);
    if (isResponsesEvent(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function sendEvent(socket: WebSocket, event: OpenAIResponsesWebSocketEvent): void {
  if (socket.readyState === WebSocket.OPEN) {
    if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      socket.close(1008, 'Buffer overflow: client not draining');
      return;
    }
    socket.send(JSON.stringify(event));
  }
}

function addStreamId(
  event: OpenAIResponsesWebSocketEvent,
  streamId: string | undefined,
): OpenAIResponsesWebSocketEvent {
  return streamId ? { ...event, stream_id: streamId } : event;
}

function sendWebSocketError(socket: WebSocket, error: unknown, streamId?: string): void {
  sendEvent(
    socket,
    addStreamId(
      {
        type: 'error',
        error: {
          code: 'invalid_request_error',
          message: error instanceof Error ? error.message : String(error),
          type: 'invalid_request_error',
        },
      },
      streamId,
    ),
  );
}

function rawDataToByteLength(rawData: RawData): number {
  if (typeof rawData === 'string') {
    return Buffer.byteLength(rawData, 'utf8');
  }
  if (Array.isArray(rawData)) {
    return rawData.reduce((acc, buf) => acc + buf.byteLength, 0);
  }
  if (rawData instanceof ArrayBuffer) {
    return rawData.byteLength;
  }
  return rawData.length;
}

function rawDataToString(rawData: RawData): string {
  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData).toString('utf8');
  }
  if (rawData instanceof ArrayBuffer) {
    return Buffer.from(rawData).toString('utf8');
  }
  return rawData.toString('utf8');
}

function resolvePathname(url: string | undefined): string {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function isResponsesEvent(value: unknown): value is OpenAIResponsesWebSocketEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, 'type') === 'string'
  );
}
