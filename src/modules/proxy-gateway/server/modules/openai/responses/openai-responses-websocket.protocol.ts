import { randomUUID } from 'node:crypto';

import { mergeOpenAIResponsesInputItems } from './openai-responses-session.store';

export type OpenAIResponsesWebSocketEvent = Record<string, unknown> & {
  type: string;
};

export type OpenAIResponsesWebSocketAction =
  | {
      events: OpenAIResponsesWebSocketEvent[];
      kind: 'local';
      streamId?: string;
    }
  | {
      kind: 'request';
      request: Record<string, unknown>;
      streamId?: string;
    };

interface CachedWebSocketResponse {
  output: unknown[];
  prewarm: boolean;
  request: Record<string, unknown>;
}

const MAX_CONNECTION_RESPONSES = 128;
const STREAM_ID_PATTERN = /^[A-Za-z0-9_.-]{1,256}$/u;

/**
 * Connection-local Responses state for the official WebSocket transport.
 *
 * Every turn is a `response.create`. `stream_id` controls scheduling only;
 * `previous_response_id` controls lineage and may resolve either through the
 * durable HTTP-compatible store or this bounded connection cache.
 */
export class OpenAIResponsesWebSocketProtocol {
  private readonly responses = new Map<string, CachedWebSocketResponse>();

  public accept(payload: unknown): OpenAIResponsesWebSocketAction {
    const event = toRecord(payload);
    if (!event) {
      throw new Error('WebSocket request must be a JSON object.');
    }
    const eventType = getString(event, 'type');
    if (eventType !== 'response.create') {
      throw new Error(`Unsupported WebSocket request type: ${eventType ?? '(missing)'}.`);
    }

    const streamId = this.parseStreamId(event);
    if (event.generate === false) {
      return {
        events: this.handlePrewarmLocally(event, streamId),
        kind: 'local',
        ...(streamId ? { streamId } : {}),
      };
    }

    return {
      kind: 'request',
      request: this.normalizeRequest(event),
      ...(streamId ? { streamId } : {}),
    };
  }

  public complete(response: unknown, request: Record<string, unknown>): void {
    const responseRecord = toRecord(response);
    const responseId = getString(responseRecord, 'id');
    if (!responseRecord || !responseId) {
      return;
    }

    this.remember(responseId, {
      output: Array.isArray(responseRecord.output) ? responseRecord.output : [],
      prewarm: false,
      request: structuredClone(request),
    });
  }

  private parseStreamId(payload: Record<string, unknown>): string | undefined {
    const rawStreamId = payload.stream_id;
    if (rawStreamId === undefined) {
      return undefined;
    }
    if (typeof rawStreamId !== 'string' || !STREAM_ID_PATTERN.test(rawStreamId)) {
      throw new Error(
        'stream_id must be 1-256 characters containing only letters, numbers, underscores, hyphens, or periods.',
      );
    }
    return rawStreamId;
  }

  private handlePrewarmLocally(
    payload: Record<string, unknown>,
    streamId: string | undefined,
  ): OpenAIResponsesWebSocketEvent[] {
    const model = getString(payload, 'model');
    if (!model) {
      throw new Error('Missing model in response.create prewarm request.');
    }
    const responseId = `resp_prewarm_${randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);
    const request = stripTransportFields(payload);
    this.remember(responseId, { output: [], prewarm: true, request });

    return [
      withStreamId(
        {
          type: 'response.created',
          sequence_number: 0,
          response: {
            id: responseId,
            object: 'response',
            created_at: createdAt,
            status: 'in_progress',
            background: false,
            error: null,
            output: [],
            model,
          },
        },
        streamId,
      ),
      withStreamId(
        {
          type: 'response.completed',
          sequence_number: 1,
          response: {
            id: responseId,
            object: 'response',
            created_at: createdAt,
            status: 'completed',
            background: false,
            error: null,
            output: [],
            usage: {
              input_tokens: 0,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens: 0,
              output_tokens_details: { reasoning_tokens: 0 },
              total_tokens: 0,
            },
            model,
          },
        },
        streamId,
      ),
    ];
  }

  private normalizeRequest(payload: Record<string, unknown>): Record<string, unknown> {
    const normalized = stripTransportFields(payload);
    normalized.stream = true;
    normalized.input ??= [];

    const previousResponseId = getString(payload, 'previous_response_id');
    const parent = previousResponseId ? this.responses.get(previousResponseId) : undefined;
    if (parent) {
      const parentInput = Array.isArray(parent.request.input) ? parent.request.input : [];
      const newInput = Array.isArray(normalized.input) ? normalized.input : [];
      normalized.input = mergeOpenAIResponsesInputItems(
        [...parentInput, ...parent.output],
        newInput,
        parent.output,
      );
      normalized.model ??= parent.request.model;
      if (parent.prewarm) {
        for (const field of ['instructions', 'tools', 'tool_choice']) {
          normalized[field] ??= parent.request[field];
        }
      }
      delete normalized.previous_response_id;
    }

    if (!getString(normalized, 'model') && !getString(normalized, 'previous_response_id')) {
      throw new Error('Missing model in response.create request.');
    }
    return normalized;
  }

  private remember(responseId: string, response: CachedWebSocketResponse): void {
    this.responses.delete(responseId);
    this.responses.set(responseId, response);
    while (this.responses.size > MAX_CONNECTION_RESPONSES) {
      const oldest = this.responses.keys().next().value;
      if (typeof oldest !== 'string') {
        break;
      }
      this.responses.delete(oldest);
    }
  }
}

function stripTransportFields(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...payload };
  delete normalized.type;
  delete normalized.generate;
  delete normalized.stream_id;
  delete normalized.background;
  return normalized;
}

function withStreamId(
  event: OpenAIResponsesWebSocketEvent,
  streamId: string | undefined,
): OpenAIResponsesWebSocketEvent {
  return streamId ? { ...event, stream_id: streamId } : event;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(record: Record<string, unknown> | null, field: string): string | null {
  const value = record?.[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
