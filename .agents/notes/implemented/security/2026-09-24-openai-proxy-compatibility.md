# Agent Note: OpenAI Proxy Compatibility and Administrative Isolation

Status: implemented

## Problem

Several public OpenAI-compatible paths diverged from current OpenAI contracts. Responses WebSocket used a private `response.append` event and serialized the entire connection, unsupported Responses input items were silently discarded, continuations inherited top-level instructions, and streamed Chat Completions could not be stored. New quota and billing extensions also exposed administrative account metadata through ordinary proxy-client authorization. Multipart audio tests bypassed the actual Fastify wire boundary.

## Decision

The gateway treats OpenAI compatibility and gateway administration as separate surfaces.

- Standard protocol routes retain `ProxyGuard`; account quota and billing routes require `AdminGuard`.
- Responses WebSocket accepts repeated `response.create` events, uses `stream_id` only for lane scheduling and event routing, maintains FIFO order within a lane, and permits concurrency across lanes.
- Connection-local response state supports prewarm, `store: false` continuation, and cross-lane forks without inheriting ordinary prior instructions.
- Unsupported or malformed Responses input items return a named `400` error instead of disappearing.
- Chat streaming reconstructs and stores its terminal completion when `store: true`.
- Completed and incomplete terminal Responses may be retained for retrieval and continuation.
- Audio multipart bytes are parsed from Fastify parts before entering operations.
- Quote and billing extensions publish configured or observed values only; unknown pricing, capability, context, and quota values are omitted rather than guessed.

The dated compatibility matrix in `docs/openai-api-compatibility.md` is the source of truth for supported routes, deviations, and extension scopes.

## Alternatives considered

Keeping the private WebSocket `response.append` protocol was rejected because current official SDKs send `response.create` for every turn. Disabling WebSocket entirely was rejected because connection-local continuation and lane scheduling can be implemented without changing the upstream provider. Allowing ordinary proxy keys to read redacted quota data was rejected because even redacted per-account operational state belongs to the administrative trust zone. Fabricating model metadata from name patterns was rejected because wrong cost or capacity data is more harmful than an omitted unknown value.

## Consequences

Clients using the private `response.append` event must migrate to `response.create` with `previous_response_id`. Scoped proxy keys can no longer call account quota or billing endpoints. Stored streaming Chat Completions incur bounded local persistence after successful stream completion. The local one-hour retention remains intentionally shorter than OpenAI hosted retention and is documented as a deviation.

## Verification

Type checking, focused protocol tests, the route census, documentation formatting, agent-contract validation, and boundary verification own this decision. A real Fastify multipart injection test covers the audio wire parser. WebSocket tests cover prewarm, named stream echo, current request types, and split upstream SSE frames.
