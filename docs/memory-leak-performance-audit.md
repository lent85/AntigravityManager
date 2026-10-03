# Memory Leak & Performance Audit

> **Date**: 2026-09-18  
> **Scope**: Full codebase review of `src/` — main process, renderer, proxy gateway, persistence, and IPC.

---

## Executive Summary

The codebase is well-structured with good lifecycle management across most services. However, several areas carry **memory leak risks** from unbounded in-memory collections, **performance concerns** from synchronous I/O on hot paths, and **resource management gaps** in long-running services. This document classifies each finding by severity and location.

---

## 🔴 Critical — Memory Leak Risks

### 1. `notifiedManualUpdateVersions` — Unbounded Set (Main Process)

**File**: [`main.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/main.ts#L167)

```typescript
const notifiedManualUpdateVersions = new Set<string>();
```

This module-level `Set` grows by one entry per notified version and is **never cleared**. While individual update versions are small strings, this set lives for the entire application lifetime and has no eviction policy.

**Impact**: Low (versions are rare), but violates the principle of bounded lifetime for module-level collections.

**Recommendation**: Limit to last N entries (e.g., 50) or clear on window reload/re-create.

---

### 2. `RateLimitTrackerService` — Unbounded `lockoutByKey` and `failureCounts` Maps

**File**: [`rate-limit-tracker.service.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/modules/proxy-gateway/server/shared/services/rate-limit-tracker.service.ts#L414-L415)

```typescript
private readonly lockoutByKey = new Map<string, RateLimitInfo>();
private readonly failureCounts = new Map<string, FailureCountEntry>();
```

- **`lockoutByKey`**: Entries are added on every rate-limited response. `cleanupExpired()` exists but is **never called on a timer** — it's only called explicitly. Over long uptime with many accounts × models, this map can grow without bound.
- **`failureCounts`**: Uses a 1-hour TTL per entry (`FAILURE_COUNT_EXPIRY_MS = 60 * 60 * 1000`) but stale entries are only cleaned up lazily inside `incrementFailureCount`. Entries for accounts/models that stop producing errors are never removed.

**Impact**: Medium. With many accounts and diverse models, the maps can accumulate hundreds of stale entries over days of uptime.

**Recommendation**:

- Add a periodic `cleanupExpired()` call on a timer (e.g., every 10 minutes) that also sweeps stale `failureCounts`.
- Alternatively, add a `size` guard and evict oldest entries when a ceiling is reached.

---

### 3. `AccountLeaseSelectionPolicy.sessionBindings` — TTL-only Eviction

**File**: [`account-lease-selection.policy.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/modules/proxy-gateway/server/modules/account-lease/policies/account-lease-selection.policy.ts#L50)

```typescript
private sessionBindings: Map<string, { accountId: string; expiresAt: number }> = new Map();
```

Session bindings are added on every sticky-session request and evicted by `clearExpiredSessionBindings()` — but only when `selectCandidate` is called. If traffic stops, stale entries remain in memory indefinitely.

**Impact**: Medium. Each entry is small (~100 bytes), but under sustained proxy traffic with diverse session keys, this can reach thousands of entries.

**Recommendation**: Add an `onModuleDestroy` cleanup or a periodic sweep timer that runs independently of request traffic.

---

### 4. `AccountLeaseLimitPolicy.accountCooldowns` — No Eviction

**File**: [`account-lease-limit.policy.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/modules/proxy-gateway/server/modules/account-lease/policies/account-lease-limit.policy.ts#L48)

```typescript
private readonly accountCooldowns = new Map<string, number>();
```

Cooldown timestamps are set when accounts hit 401/403/429 but **never removed**. Expired entries (where `cooldownUntil < now`) are skipped at read-time but the map entry persists.

**Impact**: Low-Medium. Grows by at most one entry per account, but with account churn the map accumulates dead entries indefinitely.

**Recommendation**: Sweep expired cooldown entries when reading or on a periodic timer.

---

### 5. `ExplicitContextCacheManager.failedUntil` — Unbounded Failure Map

**File**: [`explicit-context-cache.store.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/modules/proxy-gateway/server/modules/gemini/explicit-context-cache.store.ts#L49)

```typescript
private readonly failedUntil = new Map<string, number>();
```

Failed cache creation keys are stored with a 5-minute cooldown. `evictExpiredFailureCooldowns()` exists and runs during `getStats()` and `resolve()`, but if many unique cache keys fail, entries accumulate until their cooldown expires. The `entries` map is capped at `MAX_ENTRIES = 500`, but `failedUntil` has **no cap**.

**Impact**: Low. Cache keys are content-hash-based so diversity is bounded by actual request patterns.

**Recommendation**: Apply a `MAX_ENTRIES`-style cap to `failedUntil` as well.

---

## 🟡 Warning — Performance Issues

### 6. `logPacket` — Synchronous `appendFileSync` on Every ORPC Message

**File**: [`main.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/main.ts#L94-L105)

```typescript
function logPacket(data: unknown) {
  try {
    fs.appendFileSync(
      packetLogPath,
      `[${new Date().toISOString()}] ${safeStringifyPacket(data)}\n`,
    );
  } catch (e) { ... }
}
```

Every ORPC IPC message triggers a **synchronous disk write** (`appendFileSync`) on the main process. This blocks the event loop for the duration of the write, and `safeStringifyPacket` may itself be expensive for large payloads.

**Impact**: High on busy workloads. ORPC messages flow on every renderer↔main interaction. Under load, this serializes the main process event loop on disk I/O.

**Recommendation**:

- Switch to `fs.appendFile` (async) or buffer writes and flush periodically.
- Consider making packet logging opt-in via an environment variable or debug flag.
- Move logging off the critical IPC path.

---

### 7. `backgroundThrottling: false` — Prevents Chromium from Throttling Background Tabs

**File**: [`main.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/main.ts#L421)

```typescript
webPreferences: {
  backgroundThrottling: false,
  ...
}
```

Combined with `disableWindowsPowerThrottling()`, this ensures the renderer runs at full speed even when minimized to tray. For a tray-resident app this is intentional (to keep cloud monitoring responsive), but it means the renderer's timer-based polls (e.g., `SidebarIndicators` setInterval) and React Query's `refetchInterval` never slow down.

**Impact**: Elevated CPU and power consumption when the window is hidden.

**Recommendation**: This is an intentional design decision, but consider pausing renderer-side intervals when `document.hidden` is true, or gating `backgroundThrottling: false` behind a feature flag.

---

### 8. `contextIsolation: false` + `nodeIntegration: true` — Security and Performance

**File**: [`main.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/main.ts#L426-L427)

```typescript
contextIsolation: false,
nodeIntegration: true,
```

While not a direct memory leak, disabling context isolation and enabling `nodeIntegration` in the renderer:

- Gives the renderer access to the full Node.js API, risking accidental resource creation (file handles, child processes, timers) that are harder to track.
- Makes Electron security recommendations impossible to follow.

**Impact**: Increases the surface area for resource leaks in the renderer process. Any third-party dependency running in the renderer can interact with Node APIs.

**Recommendation**: Documented in `docs/security.md`. Migrating to `contextIsolation: true` / `nodeIntegration: false` is a large effort but would reduce the leak surface.

---

### 9. `CloudMonitorService.poll()` — Sequential Network I/O with Inline Sleeps

**File**: [`CloudMonitorService.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/modules/cloud-account/services/CloudMonitorService.ts#L459-L689)

The polling loop iterates all accounts **sequentially**, with a configurable 30–45s random delay between each account. For N accounts, a single poll round takes `O(N × 35s)` minimum.

```typescript
await new Promise((r) => setTimeout(r, 1000)); // L529 — hard-coded 1s delay
// ... then 30–45s between accounts
```

**Impact**: With 20 accounts, a single poll round takes ~12 minutes minimum, which may exceed the default 5-minute poll interval. The service handles this gracefully (schedules next poll immediately), but the stale data window grows.

**Recommendation**:

- Consider batching concurrent refreshes for accounts in the same family group.
- Consider making the inter-account delay configurable down to 0 for power users.
- Remove the hard-coded 1-second delay on L529 or make it configurable.

---

### 10. `DurableRecordStore.get()` — Writes on Every Read

**File**: [`durable-record-store.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/shared/persistence/durable-record-store.ts#L55-L73)

```typescript
public get(key: string, now: number = Date.now()): TValue | null {
  ...
  // Re-insert so map order stays least-recently-written first for eviction.
  record.updatedAt = now;
  this.records.delete(key);
  this.records.set(key, record);
  this.schedulePersist();  // ← triggers async disk write
  return record.value;
}
```

Every `get()` call updates the record's `updatedAt`, re-inserts it for LRU order, and schedules a disk persist. This is correct for LRU semantics but means every read triggers a write. For frequently-accessed stores this creates unnecessary I/O.

**Impact**: Medium. The write is coalesced (one pending write at a time), but on stores that are read often (e.g., session stores), this generates constant background I/O.

**Recommendation**: Consider a "read-touch" mode that updates `updatedAt` in memory but only persists on actual `set()` or after a longer interval.

---

### 11. `before-exit` — Duplicate Log Statement

**File**: [`main.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/main.ts#L380-L383)

```typescript
process.on('before-exit', (code) => {
  logger.info(`Process before-exit event triggered with code: ${code}`);
  logger.info(`Process before-exit event triggered with code: ${code}`); // duplicate
});
```

Harmless but indicates a copy-paste error.

**Recommendation**: Remove the duplicate line.

---

## 🟢 Good Patterns (Already Handled Well)

### Timer Lifecycle Management ✓

| Service                   | Timer                            | Cleanup                                   |
| ------------------------- | -------------------------------- | ----------------------------------------- |
| `OpenAIUploadsService`    | `sweepTimer` (setInterval)       | `onModuleDestroy()` calls `clearInterval` |
| `FileContentStore`        | `sweepTimer` (setInterval)       | `onModuleDestroy()` calls `clearInterval` |
| `CloudMonitorService`     | `nextPollTimeout` (setTimeout)   | `stop()` clears timeout                   |
| `AccountEmulationService` | `tickerTimer` (setInterval)      | `stopTicker()` clears interval            |
| `SidebarIndicators`       | `setInterval` in useEffect       | Returns cleanup `clearInterval`           |
| `PerformanceRecorder`     | `metricsTimer`, `eventLoopTimer` | `stop()` calls `clearInterval`            |

### NestJS Server Shutdown ✓

[`server/main.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/server/main.ts#L214-L230) properly detaches WebSocket servers and calls `app.close()` which triggers NestJS module destroy hooks.

### Renderer IPC Listeners ✓

[`preload.ts`](file:///d:/Projects/%23external.customize/AntigravityManager/src/preload.ts) returns cleanup functions from `onGoogleAuthCode`, `onAccountSyncStatus`, and `onManualUpdateAvailable`. The `useCloudAccounts` hook properly returns the IPC cleanup function from its `useEffect`.

### Bounded Collections ✓

- `DurableRecordStore` has `maxEntries` and `ttlMs` eviction policies.
- `ExplicitContextCacheManager.entries` is capped at `MAX_ENTRIES = 500`.
- `OpenAIUploadsService` has `maxPendingUploads` and TTL-based sweep.
- `FileContentStore` has `maxStoreBytes`, `maxFileBytes`, and TTL-based sweep.
- `ModelRouteMissJournalService` is backed by a bounded `DurableRecordStore`.

### Tray Shutdown ✓

[`requestTrayShutdown()`](file:///d:/Projects/%23external.customize/AntigravityManager/src/main.ts#L522-L557) properly stops `CloudMonitorService`, `AuthServer`, and `NestServer` with a 3-second timeout before forcing exit.

---

## Summary of Recommendations

| #   | Finding                                            | Severity   | Effort  | Action                                |
| --- | -------------------------------------------------- | ---------- | ------- | ------------------------------------- |
| 1   | `notifiedManualUpdateVersions` unbounded Set       | 🔴 Low     | Trivial | Cap or clear on window re-create      |
| 2   | `RateLimitTrackerService` maps no periodic cleanup | 🔴 Medium  | Low     | Add periodic `cleanupExpired()` timer |
| 3   | `sessionBindings` stale entry accumulation         | 🔴 Medium  | Low     | Add periodic sweep or max-size cap    |
| 4   | `accountCooldowns` never evicted                   | 🔴 Low-Med | Trivial | Sweep on read or periodic timer       |
| 5   | `failedUntil` unbounded in context cache           | 🔴 Low     | Trivial | Add max-entries cap                   |
| 6   | `logPacket` sync disk write on IPC hot path        | 🟡 High    | Medium  | Switch to async or buffered writes    |
| 7   | `backgroundThrottling: false` — always-on renderer | 🟡 Medium  | Medium  | Pause renderer intervals when hidden  |
| 8   | `contextIsolation: false` broadens leak surface    | 🟡 Medium  | Large   | Long-term migration path              |
| 9   | `CloudMonitorService.poll()` sequential + sleep    | 🟡 Medium  | Medium  | Consider parallel family batches      |
| 10  | `DurableRecordStore.get()` persists on every read  | 🟡 Medium  | Medium  | Add LRU-touch-only mode               |
| 11  | Duplicate log line in `before-exit`                | 🟢 Trivial | Trivial | Remove duplicate                      |
