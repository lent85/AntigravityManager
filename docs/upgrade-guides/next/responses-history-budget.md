# Upgrade guide: Keep Responses continuation within the retained-history budget

Target version: next

## Affected users

Responses API clients continuing conversations with large tool output, non-ASCII text, instructions or response metadata may reach the existing 4 MiB history limit earlier. Earlier builds measured only parts of continuation history and could truncate long strings. Normal histories below the complete record ceiling need no configuration change.

## Required action

1. Let the client compact or summarize large conversations before continuing them. Keep tool-call arguments and matching results together.
2. If a new history write reports the maximum byte limit, reduce retained context or start a new conversation with a summary. Do not blindly replay an AI request: generation may already have completed before its history could be stored.
3. If old continuation text was already truncated, recover the original from the client transcript and start a fresh conversation. Updating cannot recover discarded text.

## Data and recovery

The record layout and existing files are unchanged. Rejected writes do not replace a previously accepted record. There is no migration or automatic deletion. The client owns its transcript backup; preserve that transcript before compacting. The application does not reconstruct lost tool output. Existing files are read through the existing decoder, so this change is not a retroactive byte cap on historical hydration.

## Downgrade

The JSON layout is unchanged and older releases use their existing decoder. No restore is required solely for this change, but an older release can reintroduce silent truncation and incomplete limits. Native downgrade acceptance has not been performed.

## Verification

The [session tests](../../../src/tests/unit/openai-responses-session.store.test.ts) exercise long tool arguments, UTF-8 root writes and metadata rejection. Existing [durability tests](../../../src/tests/unit/openai-responses-session-durability.test.ts) check file round trips. These synthetic tests do not prove recovery of a live client's lost transcript or native downgrade behavior. See the [resource reference](../../memory-leak-performance-audit.md) and [decision](../../../.agents/notes/implemented/bug-fix/2026-11-18-resource-cancellation-and-history-budgets.md).
