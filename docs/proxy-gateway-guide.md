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

- **Protocol entry modules (`server/modules/openai`, `server/modules/anthropic`, `server/modules/gemini`)**: Own HTTP/WebSocket controllers, transport parsing, protocol services, and provider-specific request handling.
- **Protocol mappers (`src/modules/proxy-gateway/antigravity`)**: Convert OpenAI, Anthropic, and Gemini shapes to and from the upstream Gemini-compatible representation.
- **Routing and quota policy (`server/modules/account-lease`, `server/shared/services`)**: Own account selection, quota enforcement, retry, model routing, and availability state.
- **Durable protocol state (`server/modules/openai/responses`, `server/modules/openai/chat`, `server/modules/files`, `server/modules/batch`)**: Own bounded client-visible state and recovery.

For the exact OpenAI route and deviation matrix, see [openai-api-compatibility.md](openai-api-compatibility.md).

---

## 2. Supporting New Models or Providers

When adding a new model or provider route:

1. **Register the Model**:
   - Add model identifiers to the owning registry in `src/modules/proxy-gateway/antigravity/ModelMapping.ts`, or add a user-configured alias through `src/modules/config/model-aliases.ts`.
   - Specify whether the model supports thinking/reasoning blocks, tool calling, image attachments, or explicit context caching.

2. **Protocol Mapping**:
   - If mapping an upstream provider to OpenAI or Anthropic format, update the owning mapper in `src/modules/proxy-gateway/antigravity/` and the route service under `server/modules/<protocol>/`.
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

## 4. Gemini Explicit Context Caching

The gateway integrates natively with Google Vertex AI / Gemini's `cachedContents` resource API to deliver automatic, zero-configuration context caching for downstream clients (Cursor, Claude Code, Cline, OpenAI SDK, Anthropic SDK).

### How It Works

1. **Candidate Qualification (`ExplicitContextCacheManager`)**:
   - Analyzes `systemInstruction` and `tools` on incoming generation requests (`generateContent`, `streamGenerateContent`).
   - Requests qualify when static prefix length reaches `PROXY_CONTEXT_CACHE_MIN_CHARACTERS` (default: 8,192 characters). Image generation requests are excluded.
   - Computes a SHA-256 hash across `{ model, project, systemInstruction, toolConfig, tools }`.

2. **Upstream Creation & Reuse**:
   - If a cached resource does not exist in the in-memory LRU store (capacity: 500 entries), the gateway issues a `POST /v1/projects/{project}/locations/{location}/cachedContents` call to Vertex AI with a default TTL of 1 hour (3,600s).
   - Subsequent requests sharing the identical static hash reuse the provisioned resource name (`projects/.../locations/.../cachedContents/<id>`).

3. **Request Trimming & Speedup**:
   - The generation payload dispatched upstream omits `systemInstruction`, `tools`, and `toolConfig`, replacing them with `cachedContent: "<resource_name>"`.
   - This drastically cuts upload payload size, slashes Time To First Token (TTFT), and qualifies for Gemini context caching discounts.

4. **Resilient Failover & Recovery**:
   - If upstream returns `404 Not Found` or `400` indicating cache eviction or expiry, the gateway automatically invalidates the local key and retries the request once immediately with the full, un-cached original payload. Client requests never fail due to cache misses.

5. **Token Accounting & Client Mapping**:
   - Upstream `cachedContentTokenCount` is normalized into downstream client response shapes:
     - **OpenAI**: `usage.prompt_tokens_details.cached_tokens`
     - **Anthropic**: `usage.cache_read_input_tokens`

6. **Prompt Stabilization**:
   - Dynamic timestamps (e.g., `Current time: ...`) and ephemeral UUIDs/trace IDs injected by agent CLI clients are sanitized via `StablePromptPrefix` to preserve high cache hit rates across turns.

### Configuration Environment Variables

| Variable                             | Default                                        | Purpose                                                                       |
| :----------------------------------- | :--------------------------------------------- | :---------------------------------------------------------------------------- |
| `PROXY_CONTEXT_CACHE_ENABLED`        | `true`                                         | Set to `false` to disable explicit context caching entirely.                  |
| `PROXY_CONTEXT_CACHE_MIN_CHARACTERS` | `8192`                                         | Minimum character length of static prefix required to trigger caching.        |
| `PROXY_CONTEXT_CACHE_TTL_SECONDS`    | `3600`                                         | Expiration TTL (in seconds) assigned to provisioned upstream cache resources. |
| `PROXY_CONTEXT_CACHE_LOCATION`       | `us-central1`                                  | Google Cloud / Vertex AI region for `cachedContents` endpoints.               |
| `PROXY_CONTEXT_CACHE_BASE_URL`       | `https://{location}-aiplatform.googleapis.com` | Base URL for Vertex AI API requests.                                          |

---

## 5. Verification and Parity Testing

Because the proxy gateway is a critical external compatibility surface, changes must be verified against dedicated test suites:

```powershell
# 1. Run the route census and focused OpenAI real-path tests
npm test -- src/tests/unit/gateway-endpoint-coverage.test.ts src/tests/unit/proxy-controller.integration.test.ts src/tests/unit/proxy-real-path-responses.test.ts

# 2. Add the exact owning mapper, streaming, store, or policy test files for the changed surface
npm test -- src/tests/unit/openai-responses-streaming-mapper.test.ts src/tests/unit/openai-responses-session-durability.test.ts

# 3. Verify runtime boundary enforcement
npm run verify:boundaries
```

If CodeGraph or Codanna reports an empty or stale index, use `rg` or `ast-grep` for bounded discovery and record the unavailable semantic index in the verification report. Do not treat an empty semantic search result as proof that a symbol has no consumers.

### Parity Principles

- Prefer testing complete result objects or event sequences rather than isolated field assertions.
- Use loopback fixtures (`src/tests/fixtures/`) to simulate upstream responses deterministically.
- If modifying external protocol behavior, durable store formats, or credential handling, create an Agent Note under `.agents/notes/` documenting the rationale and trade-offs.
