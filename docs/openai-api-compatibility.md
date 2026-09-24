# OpenAI API Compatibility Reference

This current reference describes the OpenAI-compatible surface implemented by the embedded proxy. The compatibility baseline was reviewed against the official OpenAI API documentation on 2026-09-24:

- [Models](https://developers.openai.com/api/reference/cli/resources/models)
- [Chat Completions](https://developers.openai.com/api/reference/cli/resources/chat/subresources/completions)
- [Responses](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Responses WebSocket mode](https://developers.openai.com/api/docs/guides/websocket-mode)
- [API errors](https://developers.openai.com/api/docs/guides/error-codes)

The gateway is a partial compatibility implementation. A route listed as an extension is not part of the OpenAI API and clients must not infer OpenAI behavior from it.

## Quick start

Use the configured gateway base URL and a proxy API key:

```powershell
$headers = @{ Authorization = "Bearer <proxy-api-key>" }
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8045/v1/responses" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"model":"gemini-3-flash","input":"Reply with OK"}'
```

The official JavaScript SDK can target the gateway by changing `baseURL`:

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.ANTIGRAVITY_PROXY_API_KEY,
  baseURL: 'http://127.0.0.1:8045/v1',
});

const response = await client.responses.create({
  model: 'gemini-3-flash',
  input: 'Reply with OK',
});
```

## Authentication scopes

Ordinary protocol routes use `ProxyGuard` and accept enabled proxy API keys. Administrative routes use the primary `proxy.api_key` through `AdminGuard`; scoped client keys cannot read account identities, account quota state, or billing usage.

| Scope         | Routes                                                                                 |
| ------------- | -------------------------------------------------------------------------------------- |
| Proxy client  | Standard OpenAI-compatible routes, `GET /v1/models/quote`, and `GET /v1/gateway/quote` |
| Administrator | `GET /v1/gateway/quota`, `GET /v1/dashboard/billing/usage`                             |

When at least one proxy key is configured, the server may listen on `0.0.0.0`. Treat administrative credentials as remote-access secrets.

## Capability matrix

| Surface                 | Status  | Implemented behavior and limits                                                                                                                                                                                         |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models                  | Partial | `GET /v1/models` and `GET /v1/models/{model}`. Fine-tuned model deletion is not implemented.                                                                                                                            |
| Chat Completions        | Partial | Unary and SSE create, tool calls, `store: true`, and retrieval by ID. Streaming with storage is supported by reconstructing the final completion. List, update, delete, and stored-message listing are not implemented. |
| Legacy Completions      | Partial | `POST /v1/completions` adapts text prompts to the chat execution path.                                                                                                                                                  |
| Responses HTTP          | Partial | Unary and typed SSE create, retrieval, deletion, `previous_response_id`, tools, images, audio, and local durable continuation. Unsupported or malformed input items return `400`; they are never silently discarded.    |
| Responses WebSocket     | Partial | Repeated `response.create`, optional `stream_id`, FIFO per lane, up to 16 active responses and 32 named lanes, connection-local forks, and `generate: false` prewarm. `background` is not supported.                    |
| Images                  | Partial | Generations and multipart edits with the local media limits documented in the server reference.                                                                                                                         |
| Audio                   | Partial | Multipart transcription and English translation. The gateway returns JSON `{ "text": "..." }`; alternative OpenAI response formats and timestamp granularities are not implemented.                                     |
| Files, Uploads, Batches | Partial | Local durable implementations. They are not provider-side storage or discounted provider batch execution.                                                                                                               |

## Responses state and retention

`previous_response_id` carries prior input and output items. Top-level `instructions` apply only to the current request and are not inherited; callers must resend stable instructions on each turn.

Completed and incomplete terminal Responses are retained when `store` is not `false`. The local defaults are 500 entries and one hour, configurable through `AGM_RESPONSES_SESSION_MAX_ENTRIES` and `AGM_RESPONSES_SESSION_TTL_MS`. Stored Chat Completions use a separate 500-entry, one-hour store. These limits intentionally differ from OpenAI's hosted retention and must not be used as a 30-day archive.

WebSocket `stream_id` controls ordering and event routing, while `previous_response_id` controls conversation lineage. Named-stream events and request-scoped errors echo their `stream_id`. Reusing a stream ID without `previous_response_id` starts a new response.

## Extensions

| Route                             | Scope         | Contract                                                                                                                                                                                      |
| --------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/models/quote`            | Proxy client  | Returns configured pricing and observed aggregate model quota only when available. Missing fields mean unknown. It never guesses capability, context size, price, or quota from a model name. |
| `GET /v1/gateway/quote`           | Proxy client  | Alias of the model quote extension.                                                                                                                                                           |
| `GET /v1/gateway/quota`           | Administrator | Returns pooled model quota and per-account operational state. The response contains sensitive account metadata.                                                                               |
| `GET /v1/dashboard/billing/usage` | Administrator | Returns 30-day usage-derived estimated cost. Cost is based only on administrator-configured model pricing and is not an upstream invoice.                                                     |

## Errors

OpenAI routes return the standard `{ "error": { "message", "type", "param", "code" } }` envelope. Malformed input uses `400` and `invalid_request_error`; authentication, permission, rate limit, and service failures use their corresponding stable types. Internal 5xx responses do not expose raw exception messages.

Responses streaming uses typed events such as `response.created`, `response.output_text.delta`, `response.completed`, `response.incomplete`, and `error`. Chat Completions streaming retains the `chat.completion.chunk` delta format.

## Verification owners

The machine-readable route inventory is `src/modules/proxy-gateway/server/modules/openai/openai-compatibility.ts`; the route census in `src/tests/unit/gateway-endpoint-coverage.test.ts` verifies that inventory against the live Nest/Fastify graph. Protocol behavior is covered by the focused OpenAI tests under `src/tests/unit/`, including WebSocket, Responses durability, stored Chat Completions, multipart audio, and real-path Responses tests. Use the commands in [testing.md](testing.md) rather than searching for tests beside production files.
