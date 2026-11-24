# Memory, Resource Protection and Lifecycle Reference

This document describes the resource lifecycle, bounded queues, power event recovery, and memory protection mechanisms implemented across Electron startup, cloud monitoring, proxy gateway transports, SQLite workers, and renderer polling.

## 1. Resource Boundaries and Implementations

### WebSocket Connection Lifecycle and Bounded Queues

**Owner**: [Responses WebSocket server](../src/modules/proxy-gateway/server/modules/openai/responses/openai-responses-websocket.server.ts)

- **Cancellation Ownership**: Each connection creates an `AbortController`. Socket close or error triggers cancellation, unsubscribing active streams and forwarding the same cancellation signal through the execution adapter to upstream setup. Queued waiters are removed on cancellation; AI requests are never replayed automatically.
- **Queue Limits**: Enforces a maximum of 64 queued messages and 4 MB total queued payload bytes per connection. Overloaded requests fail fast with a descriptive error.
- **Backpressure**: Outgoing message delivery checks `socket.bufferedAmount`. If buffered data exceeds 2 MB, the socket closes with a buffer overflow policy.
- **Heartbeat**: A server-side ping/pong timer (30-second interval) detects broken connections and terminates dead sockets.

### Responses History Budgets and Chain Compaction

**Owners**: [Responses session store](../src/modules/proxy-gateway/server/modules/openai/responses/openai-responses-session.store.ts), [inline-media handling](../src/modules/proxy-gateway/server/modules/openai/responses/openai-responses-inline-media.ts)

- **History Budgets**: New history writes are constrained by `MAX_RESPONSES_CHAIN_DEPTH = 100`, `MAX_RESPONSES_HISTORY_ITEMS = 500`, and `MAX_RESPONSES_HISTORY_BYTES = 4 MB`. Over-budget continuations reject with explicit errors rather than silently corrupting or truncating conversation history.
- **Chain Compaction**: When ancestor depth reaches 20 nodes, older ancestors are collapsed into a single consolidated base root node. This bounds parent nesting in each record. Retained records still carry their own history and require an aggregate memory profile; compaction alone is not a process-wide byte ceiling.
- **Complete Record Budget**: The 4 MiB ceiling measures UTF-8 bytes of the complete retained record, including ancestors, instructions, tools, stored response, key and timestamp. Root saves and root deltas are checked before publication. Text and tool arguments are preserved without silent truncation. Existing files keep their decoder and are not retroactively migrated or byte-limited on hydration. This is a per-record bound, not a process-wide memory ceiling. See the [upgrade guide](upgrade-guides/next/responses-history-budget.md).

### SQLite Worker Lifecycle and Shutdown Deadlines

**Owner**: [bounded SQLite worker](../src/shared/persistence/sqlite-worker/bounded-sqlite-worker.ts)

- **Unified Shutdown Deadline**: `close(timeoutMs)` executes under a single deadline covering both queue idle wait and the `shutdown` command RPC. The deadline timer is always cleared in `finally`.
- **Guaranteed Termination**: If a worker fails to acknowledge shutdown within the deadline, `worker.terminate()` executes as a bounded fallback.
- **Command Timeouts**: Control command requests include an explicit 10-second timeout to prevent caller promises from hanging indefinitely if a worker becomes unresponsive.

### Power Recovery and System Lifecycle

**Owners**: [main process](../src/main.ts), [cloud monitor](../src/modules/cloud-account/services/CloudMonitorService.ts)

- **PowerMonitor Integration**: Electron `powerMonitor` events (`resume`, `unlock-screen`, `suspend`, `lock-screen`) are handled in `main.ts` and forwarded to `CloudMonitorService`.
- **Resume & Unlock**: Coalesces wake events, waits for the interrupted round to settle, rechecks shutdown admission and triggers a debounced refresh. Shutdown or a newer suspend cancels pending recovery.
- **Suspend & Lock**: Retains paused state, invalidates the interrupted round, cancels scheduled timers and aborts quota/credit requests. Focus and explicit polls cannot restart monitoring while suspended. The gateway remains available. Shared OAuth refresh and already dispatched writes/switches retain their owning completion semantics; cancellation does not roll back or replay them. These events are wired for the desktop-embedded account owner; standalone core forwarding is not implemented here.
- **Cancellable Sleep**: The randomized pre-fetch delay (1.5–3.5 seconds) uses `abortableSleep`, stopping immediately when monitoring is stopped or refreshed.

### Immediate Tray Readiness

**Owner**: [main startup chain](../src/main.ts)

- `initTray()` initializes immediately after `createWindow()` completes, ensuring the system tray icon exists even when the application starts minimized.
- Initial cloud monitoring and background sync run asynchronously without delaying tray readiness. Shutdown waits for admitted gateway auto-start within its existing deadline, and the startup tail does not reopen monitoring or presentation after quitting starts.

### Monitor Cadence and Freshness Caching

**Owner**: [cloud monitor scheduling](../src/modules/cloud-account/services/CloudMonitorService.ts)

- **Round Cooldown**: When a poll round's duration exceeds the configured interval, a minimum cooldown of 30 seconds (`MIN_ROUND_COOLDOWN_MS`) is enforced before the next round begins, avoiding back-to-back continuous polling.
- **Account Freshness**: Accounts polled within a 60-second freshness window are skipped during rapid re-polls to avoid redundant network I/O.

### Cache and Cooldown Bounds

**Owners**: [rate-limit tracker](../src/modules/proxy-gateway/server/shared/services/rate-limit-tracker.service.ts), [account lease policy](../src/modules/proxy-gateway/server/modules/account-lease/policies/account-lease-selection.policy.ts), [context cache store](../src/modules/proxy-gateway/server/modules/gemini/explicit-context-cache.store.ts)

- **RateLimitTrackerService**: Sweeps expired `failureCounts` in `cleanupExpired()`, caps retained failure counts at 1,000 entries, and clears failure records on account clear or success.
- **AccountLeaseSelectionPolicy**: Caps `sessionBindings` at 2,000 entries with automatic expiration and LRU eviction.
- **ExplicitContextCacheManager**: Caps `failedUntil` cooldown entries at 500 and limits concurrent pending cache creation tasks to 64.

### UI Polling and Durable Store Read Touches

**Owners**: [SidebarIndicators](../src/components/layout/SidebarIndicators.tsx), [CloudAccountGrid](../src/modules/cloud-account/components/CloudAccountGrid.tsx), [DurableRecordStore](../src/shared/persistence/durable-record-store.ts)

- **Visibility-Gated Polling**: `SidebarIndicators` pauses its metrics refresh timer when `document.visibilityState !== 'visible'` and invalidates queries on `visibilitychange` back to visible.
- **Centralized Model Availability Query**: `CloudAccountGrid` manages a single 15-second interval query and passes the data down to account cards, preventing dozens of independent interval observers.
- **Durable Store Read Touches**: `DurableRecordStore.get()` updates in-memory LRU timestamps without scheduling an asynchronous disk write unless `persistOnRead: true` is explicitly configured.

---

## 2. Resource Ceilings Reference Matrix

| Subsystem            | Metric / Setting                 | Bound / Limit                       | Eviction / Policy                      |
| -------------------- | -------------------------------- | ----------------------------------- | -------------------------------------- |
| Responses WebSocket  | Max queued messages              | 64 messages                         | Reject with overload error             |
| Responses WebSocket  | Max queued bytes                 | 4 MB                                | Reject with overload error             |
| Responses WebSocket  | Max buffered output              | 2 MB                                | Close socket (1008 Buffer overflow)    |
| Responses WebSocket  | Heartbeat interval               | 30 seconds                          | Terminate on missed pong               |
| Responses History    | Max chain depth                  | 100 turns                           | Reject over-depth continuation         |
| Responses History    | Max history items                | 500 items                           | Reject over-size continuation          |
| Responses History    | Max history bytes                | 4 MB                                | Reject over-size continuation          |
| Responses History    | Compaction depth                 | 20 turns                            | Collapse ancestors to single base root |
| Responses History    | Text and tool argument integrity | Complete record budget              | Preserve exactly or reject the write   |
| SQLite Worker        | Shutdown deadline                | Configured `timeoutMs` (default 2s) | Force `worker.terminate()`             |
| SQLite Worker        | Control command timeout          | 10 seconds                          | Reject caller promise                  |
| Cloud Monitor        | Minimum round cooldown           | 30 seconds                          | Enforced pause between poll rounds     |
| Cloud Monitor        | Account freshness window         | 60 seconds                          | Skip re-fetch if recently refreshed    |
| Rate Limit Tracker   | Failure count capacity           | 1,000 entries                       | Evict expired and oldest entries       |
| Account Lease Policy | Session bindings capacity        | 2,000 entries                       | Evict expired and oldest entries       |
| Context Cache        | Failed cooldown capacity         | 500 entries                         | Evict expired and oldest entries       |
| Context Cache        | Concurrent pending tasks         | 64 tasks                            | Fail fast on lookup                    |
| Durable Record Store | Read touch persistence           | Off by default                      | Persist only on mutation or eviction   |

## Acceptance limits

Focused automated evidence is separate from Windows lock/sleep, renderer/GPU recovery, startup timing, long-running RSS/CPU profiling and live-provider acceptance. Those native and measured checks remain required before claiming lower memory use or seamless physical wake recovery. See the [decision](../.agents/notes/implemented/bug-fix/2026-11-18-resource-cancellation-and-history-budgets.md).
