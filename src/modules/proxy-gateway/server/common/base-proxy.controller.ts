import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { isFunction, isObjectLike, isString } from 'lodash-es';
import { Observable } from 'rxjs';
import { UpstreamRequestError } from '@/modules/proxy-gateway/server/common/exceptions/upstream-request.exception';
import type { FileReferenceError } from '@/modules/proxy-gateway/server/modules/files/file-reference-expander';

import { getCurrentRequest, setResponseUsage } from '../shared/services/request-usage-context';

export function createProxyRequestAbortScope(
  req: FastifyRequest | undefined,
  res: FastifyReply,
): { dispose: () => void; signal?: AbortSignal } {
  if (!req?.raw || !res.raw) {
    return { dispose: () => undefined };
  }
  const controller = new AbortController();
  const abort = (): void => {
    if (!res.raw.writableEnded) {
      controller.abort();
    }
  };
  req.raw.once('aborted', abort);
  res.raw.once('close', abort);
  return {
    signal: controller.signal,
    dispose: () => {
      req.raw.removeListener('aborted', abort);
      res.raw.removeListener('close', abort);
    },
  };
}

export abstract class BaseProxyController {
  protected readonly logger = new Logger(this.constructor.name);

  protected isObservableLike(value: unknown): value is Observable<unknown> {
    return isObjectLike(value) && isFunction((value as { subscribe?: unknown }).subscribe);
  }

  protected createRequestAbortScope(
    req: FastifyRequest | undefined,
    res: FastifyReply,
  ): { dispose: () => void; signal?: AbortSignal } {
    return createProxyRequestAbortScope(req, res);
  }

  protected writeSseResponse(
    res: FastifyReply,
    stream: Observable<unknown>,
    req?: FastifyRequest,
    modelFallback?: string,
    dialect: 'default' | 'responses' = 'default',
  ): void {
    if (!res.raw || !isFunction(res.raw.writeHead) || !isFunction(res.raw.write)) {
      res.header('Content-Type', 'text/event-stream');
      res.header('Cache-Control', 'no-cache');
      res.header('Connection', 'keep-alive');
      res.send(stream);
      return;
    }

    if (isFunction((res as { hijack?: () => void }).hijack)) {
      (res as { hijack: () => void }).hijack();
    }

    res.raw.writeHead(HttpStatus.OK, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let streamModel = modelFallback || '';
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let cachedTokens = 0;

    const subscription = stream.subscribe({
      next: (chunk) => {
        if (res.raw.writableEnded) {
          return;
        }
        const payload = isString(chunk) ? chunk : String(chunk ?? '');
        res.raw.write(payload);

        // Inspect chunk for usage metadata
        if (
          payload.includes('"usage"') ||
          payload.includes('"usageMetadata"') ||
          payload.includes('"message_delta"')
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
                  if (typeof usage.prompt_tokens === 'number') promptTokens = usage.prompt_tokens;
                  if (typeof usage.promptTokenCount === 'number')
                    promptTokens = usage.promptTokenCount;
                  if (typeof usage.input_tokens === 'number') promptTokens = usage.input_tokens;

                  if (typeof usage.completion_tokens === 'number')
                    completionTokens = usage.completion_tokens;
                  if (typeof usage.candidatesTokenCount === 'number')
                    completionTokens = usage.candidatesTokenCount;
                  if (typeof usage.output_tokens === 'number')
                    completionTokens = usage.output_tokens;

                  if (typeof usage.total_tokens === 'number') totalTokens = usage.total_tokens;
                  if (typeof usage.totalTokenCount === 'number')
                    totalTokens = usage.totalTokenCount;

                  if (typeof usage.cached_tokens === 'number') cachedTokens = usage.cached_tokens;
                  if (typeof usage.total_cached_tokens === 'number')
                    cachedTokens = usage.total_cached_tokens;
                }
                if (parsed.delta?.usage?.output_tokens) {
                  completionTokens = parsed.delta.usage.output_tokens;
                }
              }
            }
          } catch {
            // Partial chunk or non-JSON; safely ignore
          }
        }
      },
      error: (error) => {
        if (req) {
          setResponseUsage(req, {
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
        if (res.raw.writableEnded) {
          return;
        }
        const message = 'The server encountered an error while processing the stream.';
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
        res.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        res.raw.end();
      },
      complete: () => {
        if (req) {
          setResponseUsage(req, {
            model: streamModel || undefined,
            promptTokens,
            completionTokens,
            totalTokens: totalTokens || promptTokens + completionTokens,
            cachedTokens,
          });
        }
        if (!res.raw.writableEnded) {
          res.raw.end();
        }
      },
    });

    res.raw.on('close', () => {
      subscription.unsubscribe();
    });
  }

  protected isProjectContextErrorMessage(message: string): boolean {
    const lowered = message.toLowerCase();
    return (
      lowered.includes('#3501') ||
      (lowered.includes('google cloud project') && lowered.includes('code assist license')) ||
      (lowered.includes('resource projects/') && lowered.includes('could not be found')) ||
      (lowered.includes('project') && lowered.includes('not found'))
    );
  }

  private resolveErrorMessageText(error: unknown): string {
    return error instanceof Error ? error.message : 'Internal Server Error';
  }

  /**
   * Answers a file handle this proxy cannot resolve, in the caller's dialect.
   *
   * It is deliberately not routed through the generic error senders: those
   * report `server_error`, and an unknown or expired handle is the client's
   * request being wrong about what exists, not this gateway failing.
   */
  protected sendFileReferenceError(
    res: FastifyReply,
    dialect: 'anthropic' | 'gemini' | 'openai',
    error: FileReferenceError,
  ): void {
    const currentReq = res.request ?? getCurrentRequest();
    if (currentReq) {
      setResponseUsage(currentReq, { errorMessage: error.message });
    }
    if (dialect === 'anthropic') {
      res.status(error.httpStatus).send({
        type: 'error',
        error: { type: 'invalid_request_error', message: error.message },
      });
      return;
    }
    if (dialect === 'gemini') {
      res.status(error.httpStatus).send({
        error: {
          code: error.httpStatus,
          message: error.message,
          status: error.httpStatus === 404 ? 'NOT_FOUND' : 'INVALID_ARGUMENT',
        },
      });
      return;
    }
    res.status(error.httpStatus).send({
      error: {
        code: 'file_not_found',
        message: error.message,
        param: error.param,
        type: 'invalid_request_error',
      },
    });
  }

  protected sendOpenAIErrorResponse(
    res: FastifyReply,
    endpoint: string,
    error: unknown,
    overrideMessage?: string,
  ): void {
    const originalMessage = overrideMessage ?? this.resolveErrorMessageText(error);
    const status = this.resolveErrorHttpStatus(originalMessage, error);
    const details = this.resolveOpenAIErrorDetails(error, status, originalMessage, overrideMessage);
    this.logProxyEndpointError(endpoint, status, details.message, error);
    const currentReq = res.request ?? getCurrentRequest();
    if (currentReq) {
      setResponseUsage(currentReq, { errorMessage: details.message });
    }
    res.status(status).send({
      error: details,
    });
  }

  private resolveOpenAIErrorDetails(
    error: unknown,
    status: HttpStatus,
    originalMessage: string,
    overrideMessage: string | undefined,
  ): { code: string | null; message: string; param: string | null; type: string } {
    const exceptionResponse = error instanceof HttpException ? error.getResponse() : null;
    const responseRecord =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? exceptionResponse
        : null;
    const responseMessage = responseRecord ? Reflect.get(responseRecord, 'message') : undefined;
    const responseCode = responseRecord ? Reflect.get(responseRecord, 'code') : undefined;
    const responseParam = responseRecord ? Reflect.get(responseRecord, 'param') : undefined;
    const responseType = responseRecord ? Reflect.get(responseRecord, 'type') : undefined;
    const type =
      typeof responseType === 'string'
        ? responseType
        : status === HttpStatus.UNAUTHORIZED
          ? 'authentication_error'
          : status === HttpStatus.FORBIDDEN
            ? 'permission_error'
            : status === HttpStatus.TOO_MANY_REQUESTS
              ? 'rate_limit_error'
              : status >= HttpStatus.INTERNAL_SERVER_ERROR
                ? status === HttpStatus.SERVICE_UNAVAILABLE
                  ? 'service_unavailable_error'
                  : 'server_error'
                : 'invalid_request_error';
    const code =
      typeof responseCode === 'string'
        ? responseCode
        : status === HttpStatus.UNAUTHORIZED
          ? 'invalid_api_key'
          : status === HttpStatus.SERVICE_UNAVAILABLE
            ? 'service_unavailable'
            : null;
    const message =
      overrideMessage ??
      (typeof responseMessage === 'string'
        ? responseMessage
        : status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? 'The server encountered an error while processing the request.'
          : originalMessage);

    return {
      code,
      message,
      param: typeof responseParam === 'string' ? responseParam : null,
      type,
    };
  }

  protected sendAnthropicErrorResponse(
    res: FastifyReply,
    endpoint: string,
    error: unknown,
    overrideMessage?: string,
  ): void {
    const message = overrideMessage ?? this.resolveErrorMessageText(error);
    const status = this.resolveErrorHttpStatus(message, error);
    this.logProxyEndpointError(endpoint, status, message, error);
    const currentReq = res.request ?? getCurrentRequest();
    if (currentReq) {
      setResponseUsage(currentReq, { errorMessage: message });
    }
    res.status(status).send({
      type: 'error',
      error: {
        type: 'api_error',
        message,
      },
    });
  }

  private resolveErrorHttpStatus(message: string, error?: unknown): HttpStatus {
    if (error instanceof HttpException) {
      return error.getStatus() as HttpStatus;
    }
    if (
      error instanceof UpstreamRequestError &&
      Number.isInteger(error.status) &&
      error.status !== undefined &&
      error.status >= 400 &&
      error.status <= 599
    ) {
      return error.status as HttpStatus;
    }

    const lowered = message.toLowerCase();
    if (lowered.includes('all accounts failed or unhealthy')) {
      return HttpStatus.SERVICE_UNAVAILABLE;
    }
    if (lowered.includes('all accounts exhausted') || lowered.includes('no available accounts')) {
      return HttpStatus.TOO_MANY_REQUESTS;
    }
    if (
      lowered.includes('network socket disconnected') ||
      lowered.includes('secure tls connection was established') ||
      lowered.includes('socket hang up') ||
      lowered.includes('econnreset') ||
      lowered.includes('eai_again')
    ) {
      return HttpStatus.SERVICE_UNAVAILABLE;
    }
    if (lowered.includes('401') || lowered.includes('unauthorized')) {
      return HttpStatus.UNAUTHORIZED;
    }
    if (lowered.includes('403') || lowered.includes('forbidden')) {
      return HttpStatus.FORBIDDEN;
    }
    if (lowered.includes('429') || lowered.includes('rate limit') || lowered.includes('quota')) {
      return HttpStatus.TOO_MANY_REQUESTS;
    }
    if (lowered.includes('503') || lowered.includes('service unavailable')) {
      return HttpStatus.SERVICE_UNAVAILABLE;
    }
    if (lowered.includes('502') || lowered.includes('bad gateway')) {
      return HttpStatus.BAD_GATEWAY;
    }
    if (lowered.includes('504') || lowered.includes('timeout')) {
      return HttpStatus.GATEWAY_TIMEOUT;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  protected logProxyEndpointError(
    endpoint: string,
    status: HttpStatus,
    message: string,
    error?: unknown,
  ): void {
    const base = `[${endpoint}] status=${status} message=${message}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(base, error instanceof Error ? error.stack : undefined);
      return;
    }
    this.logger.warn(base);
  }
}
