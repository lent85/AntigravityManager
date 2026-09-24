import { HttpStatus } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isFunction, isString } from 'lodash-es';
import type { Observable } from 'rxjs';

import {
  captureHijackedHttpResponseChunk,
  completeHijackedHttpResponse,
  getProxyResponseTimingContext,
} from '@/modules/proxy-gateway/audit/traffic-audit-context';
import {
  buildProxyResponseTimingHeaders,
  markProxyUpstreamFirstByte,
  setProxyResponseTimingHeaders,
} from './proxy-response-timing';
import { setResponseUsage } from '../shared/services/request-usage-context';

export interface SseResponseOptions {
  includeTiming?: boolean;
  request?: FastifyRequest;
  modelFallback?: string;
  dialect?: 'default' | 'responses';
}

interface HeaderState {
  written: boolean;
}

function writeHeadersOnce(
  reply: FastifyReply,
  request: FastifyRequest | undefined,
  includeTiming: boolean,
  state: HeaderState,
): void {
  if (state.written) {
    return;
  }
  state.written = true;
  reply.raw.writeHead(HttpStatus.OK, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...(includeTiming ? buildProxyResponseTimingHeaders(request) : {}),
  });
}

function writeChunk(reply: FastifyReply, request: FastifyRequest | undefined, chunk: string): void {
  captureHijackedHttpResponseChunk(request, chunk);
  reply.raw.write(chunk);
}

/** Timed streams send headers only after their first upstream chunk fixes TTFT. */
export function writeProxySseResponse(
  reply: FastifyReply,
  stream: Observable<unknown>,
  options: SseResponseOptions = {},
): void {
  const request = options.request ?? reply.request;
  const includeTiming = options.includeTiming === true;
  const dialect = options.dialect ?? 'default';
  if (!reply.raw || !isFunction(reply.raw.writeHead) || !isFunction(reply.raw.write)) {
    if (includeTiming) {
      setProxyResponseTimingHeaders(reply, request);
    }
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.send(stream);
    return;
  }

  if (isFunction((reply as { hijack?: () => void }).hijack)) {
    (reply as { hijack: () => void }).hijack();
  }

  const headerState: HeaderState = { written: false };
  if (!includeTiming) {
    writeHeadersOnce(reply, request, false, headerState);
  }

  let streamModel = options.modelFallback || '';
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let cachedTokens = 0;

  const subscription = stream.subscribe({
    next: (chunk) => {
      if (reply.raw.writableEnded) {
        return;
      }
      if (includeTiming) {
        markProxyUpstreamFirstByte(getProxyResponseTimingContext(request)?.proxyTiming);
        writeHeadersOnce(reply, request, true, headerState);
      }
      const payload = isString(chunk) ? chunk : String(chunk ?? '');
      writeChunk(reply, request, payload);

      if (
        request &&
        (payload.includes('"usage"') ||
          payload.includes('"usageMetadata"') ||
          payload.includes('"message_delta"'))
      ) {
        try {
          const trimmed = payload.trim();
          for (const line of trimmed.split('\n')) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.model) {
                streamModel = parsed.model;
              }
              const usage = parsed.usage || parsed.usageMetadata || parsed.message?.usage;
              if (usage) {
                if (typeof usage.prompt_tokens === 'number') {
                  promptTokens = usage.prompt_tokens;
                }
                if (typeof usage.promptTokenCount === 'number') {
                  promptTokens = usage.promptTokenCount;
                }
                if (typeof usage.input_tokens === 'number') {
                  promptTokens = usage.input_tokens;
                }

                if (typeof usage.completion_tokens === 'number') {
                  completionTokens = usage.completion_tokens;
                }
                if (typeof usage.candidatesTokenCount === 'number') {
                  completionTokens = usage.candidatesTokenCount;
                }
                if (typeof usage.output_tokens === 'number') {
                  completionTokens = usage.output_tokens;
                }

                if (typeof usage.total_tokens === 'number') {
                  totalTokens = usage.total_tokens;
                }
                if (typeof usage.totalTokenCount === 'number') {
                  totalTokens = usage.totalTokenCount;
                }

                if (typeof usage.cached_tokens === 'number') {
                  cachedTokens = usage.cached_tokens;
                }
                if (typeof usage.total_cached_tokens === 'number') {
                  cachedTokens = usage.total_cached_tokens;
                }
              }
              if (parsed.delta?.usage?.output_tokens) {
                completionTokens = parsed.delta.usage.output_tokens;
              }
            }
          }
        } catch {
          // ignore partial chunks
        }
      }
    },
    error: (error) => {
      if (request) {
        setResponseUsage(request, {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      if (reply.raw.writableEnded) {
        return;
      }
      writeHeadersOnce(reply, request, includeTiming, headerState);
      const message =
        dialect === 'responses'
          ? 'The server encountered an error while processing the stream.'
          : error instanceof Error
            ? error.message
            : String(error);
      const payload =
        dialect === 'responses'
          ? {
              type: 'error',
              code: 'server_error',
              message,
              param: null,
            }
          : {
              error: {
                message,
                type: 'server_error',
              },
            };
      writeChunk(reply, request, `data: ${JSON.stringify(payload)}\n\n`);
      completeHijackedHttpResponse(request, reply, { error, partial: true });
      reply.raw.end();
    },
    complete: () => {
      if (request) {
        setResponseUsage(request, {
          model: streamModel || undefined,
          promptTokens,
          completionTokens,
          totalTokens: totalTokens || promptTokens + completionTokens,
          cachedTokens,
        });
      }
      if (!reply.raw.writableEnded) {
        writeHeadersOnce(reply, request, includeTiming, headerState);
        completeHijackedHttpResponse(request, reply);
        reply.raw.end();
      }
    },
  });

  reply.raw.on('close', () => {
    if (!reply.raw.writableFinished) {
      completeHijackedHttpResponse(request, reply, { partial: true });
    }
    subscription.unsubscribe();
  });
}
