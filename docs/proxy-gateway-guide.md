# Proxy Gateway Development Guide

The Proxy Gateway in Antigravity Manager is an embedded NestJS/Fastify HTTP server running inside the Electron main process. It acts as an intelligent proxy, router, and protocol translator between local AI developer tools (such as Antigravity IDE, Cursor, Claude Code, or Aider) and upstream AI providers (Google Cloud/Gemini, Anthropic Claude, OpenAI).

## 1. Gateway Architecture

The gateway lives under `src/modules/proxy-gateway/server/` and is bootstrapped by [src/server/main.ts](../src/server/main.ts).

```plaintext
Client Request (OpenAI / Anthropic / Gemini format)
       │
       ▼
NestJS / Fastify Controller (HTTP / SSE / WebSocket)
       │
       ▼
Protocol Mapper (translates external request to internal canonical representation)
       │
       ▼
Routing & Account Leaser (selects active or fallback account based on quota/health)
       │
       ▼
Provider Adapter / Client (executes upstream request with token refresh & retry)
       │
       ▼
Response / Stream Mapper (translates upstream SSE or JSON back to client protocol)
```

### Key Subsystems

- **Controllers (`controllers/`)**: Handle HTTP route bindings, headers, query parameters, and Fastify reply streaming.
- **Protocol Mappers (`mappers/`)**: Bi-directional converters between external protocol schemas (OpenAI Chat Completions, Anthropic Messages, Gemini GenerateContent) and canonical structures.
- **Routing & Quota Policy (`services/`)**: Account selection, quota enforcement, automatic fallback when rate limits occur, and auto-switching coordination.
- **Durable History & Responses (`store/`)**: Storage and retrieval for session history and Responses API compatibility.

---

## 2. Supporting New Models or Providers

When adding a new model or provider route:

1. **Register the Model**:
   - Add model identifier and capability mappings in `src/modules/proxy-gateway/server/constants/models.ts` or the owning model registry.
   - Specify whether the model supports thinking/reasoning blocks, tool calling, image attachments, or explicit context caching.

2. **Protocol Mapping**:
   - If mapping an upstream provider to OpenAI or Anthropic format, implement the mapper functions in `src/modules/proxy-gateway/server/mappers/`.
   - Preserve required event ordering in streaming mode:
     - Role/message start -> Content deltas (thinking/reasoning blocks first if applicable) -> Tool call deltas -> Stop reason -> Usage statistics.
   - Never drop tool call IDs, call arguments, or token accounting fields.

3. **Error Normalization**:
   - Translate upstream errors (rate limits `429`, unauthorized `401`, overload `503`) to standardized client-facing error objects without leaking upstream API credentials or internal proxy state.

---

## 3. Streaming and Event Handling

- **Fastify Reply Streaming**: Use Fastify's native raw response or SSE stream helpers to write chunks as they arrive from upstream providers.
- **Thinking / Reasoning Blocks**: Models like Gemini 2.0 Flash Thinking or Claude 3.7 Sonnet emit thinking tokens. Mappers must format them as designated `reasoning_content` or commentary blocks according to client expectations (refer to [proxy-compatibility.md](proxy-compatibility.md)).
- **Connection Teardown**: Ensure abort controllers and upstream fetch streams are aborted immediately if the client disconnects prematurely.

---

## 4. Verification and Parity Testing

Because the proxy gateway is a critical external compatibility surface, changes must be verified against dedicated test suites:

```powershell
# 1. Run all proxy-gateway unit and mapper tests
npm test -- src/modules/proxy-gateway

# 2. Run protocol mapper and streaming tests
npm test -- -t "mapper"

# 3. Verify runtime boundary enforcement
npm run verify:boundaries
```

### Parity Principles

- Prefer testing complete result objects or event sequences rather than isolated field assertions.
- Use loopback fixtures (`src/tests/fixtures/`) to simulate upstream responses deterministically.
- If modifying external protocol behavior, durable store formats, or credential handling, create an Agent Note under `.agents/notes/` documenting the rationale and trade-offs.
