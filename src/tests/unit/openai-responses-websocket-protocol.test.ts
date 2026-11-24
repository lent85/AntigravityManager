import { describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { of } from 'rxjs';

import { OpenAIResponsesWebSocketProtocol } from '@/modules/proxy-gateway/server/modules/openai/responses/openai-responses-websocket.protocol';
import { attachOpenAIResponsesWebSocketServer } from '@/modules/proxy-gateway/server/modules/openai/responses/openai-responses-websocket.server';
import { SchemaInputError } from '@/modules/proxy-gateway/antigravity/schema/SchemaConversion';

describe('OpenAIResponsesWebSocketProtocol', () => {
  it('does not commit a prewarm whose schema preflight fails', () => {
    const protocol = new OpenAIResponsesWebSocketProtocol((request) => {
      if (request.tools) {
        throw new SchemaInputError('invalid-root');
      }
    });
    expect(() =>
      protocol.accept({ type: 'response.create', generate: false, model: 'fixture', tools: [{}] }),
    ).toThrow(SchemaInputError);
    expect(protocol.getPreviousResponseId()).toBe('');
    expect(
      protocol.accept({ type: 'response.create', generate: false, model: 'fixture' }).kind,
    ).toBe('local');
  });

  it('sends a local Schema input error over WebSocket before response.created', async () => {
    const server = createServer();
    let called = false;
    const detach = attachOpenAIResponsesWebSocketServer(server, {
      isAuthorized: () => true,
      validateRequest: () => {
        throw new SchemaInputError('invalid-root');
      },
      streamRequest: async () => {
        called = true;
        return of();
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP address');
    }
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/responses`);
    try {
      const event = await new Promise<unknown>((resolve, reject) => {
        socket.once('error', reject);
        socket.once('open', () =>
          socket.send(
            JSON.stringify({ type: 'response.create', generate: false, model: 'fixture' }),
          ),
        );
        socket.once('message', (data) => resolve(JSON.parse(data.toString())));
      });
      expect(event).toEqual({
        type: 'error',
        error: {
          message: 'Invalid request schema: invalid-root',
          type: 'invalid_request_error',
          code: 'invalid_schema',
        },
      });
      expect(called).toBe(false);
    } finally {
      socket.terminate();
      detach();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('handles prewarm locally and reuses it through previous_response_id', () => {
    const protocol = new OpenAIResponsesWebSocketProtocol();
    const prewarm = protocol.accept({
      type: 'response.create',
      stream_id: 'main',
      generate: false,
      model: 'gpt-5-codex',
      instructions: 'Work carefully',
      tools: [{ type: 'function', function: { name: 'shell', parameters: {} } }],
    });

    expect(prewarm.kind).toBe('local');
    if (prewarm.kind !== 'local') {
      throw new Error('Expected a local prewarm response');
    }
    expect(prewarm.events.map((event) => event.type)).toEqual([
      'response.created',
      'response.completed',
    ]);
    expect(prewarm.events[0]).toMatchObject({ sequence_number: 0, stream_id: 'main' });
    expect(prewarm.events[1]).toMatchObject({
      sequence_number: 1,
      response: {
        model: 'gpt-5-codex',
        output: [],
        status: 'completed',
      },
    });

    const next = protocol.accept({
      type: 'response.create',
      stream_id: 'main',
      previous_response_id: String((prewarm.events[1].response as { id: string }).id),
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello' }] }],
    });
    expect(next).toMatchObject({
      kind: 'request',
      request: {
        model: 'gpt-5-codex',
        instructions: 'Work carefully',
        stream: true,
      },
      streamId: 'main',
    });
  });

  it('does not inherit a previous turn without previous_response_id', () => {
    const protocol = new OpenAIResponsesWebSocketProtocol();
    protocol.accept({
      type: 'response.create',
      model: 'gpt-5-codex',
      instructions: 'Keep these instructions.',
      input: [{ type: 'message', role: 'user', content: 'Old request.' }],
    });

    const next = protocol.accept({
      type: 'response.create',
      model: 'gpt-5-codex',
      input: [{ type: 'message', role: 'user', content: 'New request.' }],
    });

    expect(next).toEqual({
      kind: 'request',
      request: {
        model: 'gpt-5-codex',
        input: [{ type: 'message', role: 'user', content: 'New request.' }],
        stream: true,
      },
    });
  });

  it('rejects the private response.append event', () => {
    const protocol = new OpenAIResponsesWebSocketProtocol();
    expect(() => protocol.accept({ type: 'response.append', input: [] })).toThrow(
      'Unsupported WebSocket request type',
    );
  });
});

describe('OpenAI Responses WebSocket transport', () => {
  it('cancels upstream setup and drops queued requests when the client closes', async () => {
    const server = createServer();
    const accepted = Promise.withResolvers<void>();
    const started = Promise.withResolvers<AbortSignal>();
    const cancelled = Promise.withResolvers<void>();
    let admissions = 0;
    let upstreamCalls = 0;
    const detach = attachOpenAIResponsesWebSocketServer(server, {
      isAuthorized: () => true,
      validateRequest: () => {
        admissions += 1;
        if (admissions === 40) {
          accepted.resolve();
        }
      },
      streamRequest: async (_request, signal) => {
        upstreamCalls += 1;
        started.resolve(signal);
        return new Promise((_, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              cancelled.resolve();
              reject(signal.reason);
            },
            { once: true },
          );
        });
      },
    });
    let socket: WebSocket | undefined;
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address');
      }
      socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/responses`);
      await once(socket, 'open');
      for (let index = 0; index < 40; index += 1) {
        socket.send(JSON.stringify({ type: 'response.create', model: 'fixture-model', input: [] }));
      }
      const signal = await started.promise;
      await accepted.promise;
      expect(signal.aborted).toBe(false);
      const closed = once(socket, 'close');
      socket.close();
      await Promise.all([closed, cancelled.promise]);
      await nextTurn();
      expect({ aborted: signal.aborted, admissions, upstreamCalls }).toEqual({
        aborted: true,
        admissions: 40,
        upstreamCalls: 1,
      });
    } finally {
      socket?.terminate();
      detach();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('serves prewarm events over GET /v1/responses without calling upstream', async () => {
    const server = createServer();
    const detach = attachOpenAIResponsesWebSocketServer(server, {
      isAuthorized: () => true,
      streamRequest: async () => {
        throw new Error('Prewarm must not call upstream');
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/responses`);
    const events = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const received: Array<Record<string, unknown>> = [];
      socket.once('error', reject);
      socket.once('open', () => {
        socket.send(
          JSON.stringify({
            type: 'response.create',
            stream_id: 'prewarm',
            generate: false,
            model: 'gpt-5-codex',
          }),
        );
      });
      socket.on('message', (data) => {
        received.push(JSON.parse(data.toString()) as Record<string, unknown>);
        if (received.length === 2) {
          resolve(received);
        }
      });
    });

    expect(events.map((event) => event.type)).toEqual(['response.created', 'response.completed']);
    expect(events.map((event) => event.stream_id)).toEqual(['prewarm', 'prewarm']);

    socket.close();
    detach();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('preserves Responses SSE events split across upstream chunks', async () => {
    const server = createServer();
    const response = {
      id: 'resp_split',
      object: 'response',
      status: 'completed',
      output: [],
    };
    const serialized = JSON.stringify({ type: 'response.completed', response });
    const detach = attachOpenAIResponsesWebSocketServer(server, {
      isAuthorized: () => true,
      streamRequest: async () =>
        of(`data: ${serialized.slice(0, 30)}`, `${serialized.slice(30)}\n\n`),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/responses`);
    const event = await new Promise<Record<string, unknown>>((resolve, reject) => {
      socket.once('error', reject);
      socket.once('open', () => {
        socket.send(
          JSON.stringify({
            type: 'response.create',
            model: 'gpt-5-codex',
            input: [],
          }),
        );
      });
      socket.once('message', (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      });
    });

    expect(event).toEqual({ type: 'response.completed', response });

    socket.close();
    detach();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
