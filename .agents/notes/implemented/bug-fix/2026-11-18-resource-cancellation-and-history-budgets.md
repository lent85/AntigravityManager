# Agent Note: Resource cancellation and complete history budgets

Status: implemented

## Problem

Clearing a timer during suspend did not invalidate an active monitor round. That round could schedule another timer while locked. Resume skipped active work rather than waiting for it. WebSocket setup did not receive connection cancellation, and its concurrency queue removed a different waiter object than the one it retained. Responses history byte estimates omitted root writes and metadata, counted characters rather than UTF-8 bytes, and truncated long strings including tool arguments.

## Decision

The monitor retains a suspend flag, invalidates the interrupted round and aborts quota/credit HTTP requests. Resume coalesces events, waits for the old round and rechecks admission and epoch before starting fresh work. Shutdown always wins. Shared OAuth refresh remains owned by its refresh coordinator: an already dispatched refresh may finish and conditionally persist its token; cancellation never replays or rolls it back. A round that is stopped does not launch further auto-switch or warmup work. Existing writes or switches already dispatched retain their own completion semantics.

The tray is initialized after window creation before gateway startup. Shutdown waits for an admitted gateway auto-start before stopping it, within the existing shutdown deadline; startup cannot reopen monitoring or presentation once quitting starts. The WebSocket connection passes its cancellation signal through Schema admission's execution adapter to the service; queued waiters remove their actual queue identity on abort. No AI operation is replayed after disconnect.

Responses writes validate the serialized record, including key, timestamp, ancestor nodes, tool state, instructions and stored response, against the existing 4 MiB ceiling using UTF-8 bytes. Root saves and root deltas obey the same ceiling and item limit as continuations. Historical text and tool arguments are preserved exactly within that ceiling. Rejection occurs before replacing the stored record. The existing JSON layout remains readable; no stored data is migrated or rewritten by this change. Previously truncated text cannot be reconstructed.

## Alternatives considered

- Merely clear timers: active work can restore scheduling after suspension.
- Replay on wake or disconnect: remote completion may be unknown and quota may be consumed twice.
- Cancel shared OAuth refresh for one monitor: another consumer may own the same refresh, and rotated credentials must retain the coordinator's conditional persistence.
- Truncate tool strings: this can corrupt structured arguments and continuation semantics.
- Count only input text: duplicated nodes and response metadata also consume retained memory and disk.

## Consequences

Oversized sessions previously admitted by incomplete estimates now fail explicitly. The [upgrade guide](../../../../docs/upgrade-guides/next/responses-history-budget.md) explains client continuation and recovery. The ceiling is per record, not a process-wide RAM guarantee; hydration of historical files and aggregate cache usage still require profiling. Locking pauses cloud monitoring in desktop-embedded mode without stopping the gateway. Standalone core power forwarding is outside this desktop event wiring.

## Verification

Focused tests cover suspend during a round, coalesced wake, shutdown overtaking wake, cancellable Google requests without endpoint fallback, real loopback WebSocket closure during setup, exact long tool arguments and oversized UTF-8 root/metadata rejection. New history checks failed against the previous implementation before repair. The suspend regression also failed before repair. Existing session/durability and SQLite shutdown suites cover preserved behavior. Execution results and remaining native/packaged evidence are reported in the task; unit tests do not establish physical sleep/resume or live-provider acceptance.

The implementation was checked on Windows with Node.js 24.22.0 and pnpm 10.34.6, starting from clean `main` at `88b40a992b77f908ffd2db920d1ceda95a2446a0`. Vitest runs use a temporary drive mapping to avoid Vite's `#` path-resolution failure without changing dependencies. The focused monitor, Google API, WebSocket, Responses history/durability/media and SQLite shutdown selections pass 109 tests across 12 files. Type-check, changed-file ESLint/Prettier and Agent contracts pass.

Additional `schema-admission.test.ts` and `openai-responses-store.controller.test.ts` selections retain three failures: unexpected-error sanitization/nullable error fields and storage of incomplete non-stream Responses. A negative control replacing only the task-owned Responses store/media source with `HEAD` reproduces all three failures; exact byte backups restore the task source afterward. These existing protocol expectation mismatches are not changed by this resource fix. The additional desktop shutdown coordinator selection passes. Desktop tray timing and quit-during-bootstrap wiring are reviewed in source; native startup/exit acceptance remains unverified. Aggregate RSS/CPU profiling, physical sleep/lock, live providers and native downgrade remain unverified. Existing reliability and failure-ownership rules cover this incident; the owning regression checks repair coverage without adding a duplicate Agent Lessons candidate.
