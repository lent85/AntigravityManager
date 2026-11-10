# Upstream Synchronization and Fork Customizations

This reference defines the relationship between this customized fork (`origin`) and the official upstream repository (`upstream`), documents all fork-specific features, and establishes strict conflict resolution and verification procedures for future merges.

## Repository Relationship

- **Upstream Repository**: `https://github.com/Draculabo/AntigravityManager.git` (tracked as `upstream`)
- **Fork / Origin Repository**: `https://github.com/lent85/AntigravityManager.git` (tracked as `origin`)
- **Default Branch**: `main`

The fork tracks official upstream releases, security updates, model mappings, and runtime fixes while maintaining a dedicated set of productivity, multi-account, and proxy enhancements.

## Inventory of Fork Customizations

Future changes and merge operations must preserve each of the following feature sets:

### 1. Cloud Account Management Extensions

Owned by `src/modules/cloud-account/`.

- **Family Group Management**:
  - Components: `FamilyCloudAccountCard.tsx`, `FamilyGroupDialog.tsx`.
  - Persistence & Stores: `persistence/family-group-store.ts`, `persistence/family-group-types.ts`, `persistence/familyGroupHandler.ts`.
  - Behavior: Accounts can be grouped into family groups (e.g. Owner vs Member). Background monitor (`CloudMonitorService`) automatically synchronizes refreshed quota to all sibling accounts in the same family group.
  - UI Indicators: Visual badges (`Crown` for owner, `Users` for members) rendered in `CloudAccountCard` and status strip.

- **Account Emulation**:
  - Services & Components: `emulation/AccountEmulationService.ts`, `components/EmulationPage.tsx`, `components/EmulationManagementDialog.tsx`.
  - Routes: `/emulation` in `src/routes/emulation.tsx`.
  - Behavior: Allows testing accounts under emulated environments, virtual fingerprints, and custom strategy definitions.

- **Status Strip, Toolbar & Compact Cards**:
  - Components: `DualCompactCloudAccountCard.tsx`, `CloudAccountToolbar.tsx`, `CloudAccountBatchActionBar.tsx`, `CardVerticalRefreshProgress.tsx`.
  - Layout: Hero blocks are redesigned into a dense, high-information status strip with integrated action controls.

- **Generation-Based Model Grouping & Quota Depth Colors**:
  - Utilities: `components/quota-colors.ts`, `components/QuotaIndicatorTooltip.tsx`.
  - Function: `groupModelsByGeneration` partitions models into generations (Gemini 2.5, Gemini 3.0, Gemini 4.0, Claude 3.5, etc.) and maps remaining quota percentages to visual depth gradients.

- **Per-Model Visibility Toggles**:
  - Component: Dropdown menu inside `CloudAccountCard` header.
  - Configuration: Stored in user config as `model_visibility: Record<string, boolean>`. Allows hiding specific model rows from the account card display.

- **Mark as In-Use Action (`onMarkActive`)**:
  - Component: Quick action in `CloudAccountCard` dropdown.
  - Behavior: Marks the selected account as actively used for Antigravity, Antigravity IDE, or Antigravity CLI without requiring a full desktop restart.

- **Identity Masking for Screen Sharing**:
  - Utilities: `utils/identity-masking.ts` (`maskEmail`, `maskInitial`, `maskName`).
  - Behavior: Redacts email addresses and personal avatars when masked mode is enabled for privacy during demonstrations or screen shares.

- **Location & License Forbidden Separation**:
  - Utilities: `utils/account-status.ts` (`isForbiddenReason`, `FORBIDDEN_HINTS`).
  - Behavior: Differentiates `paused` (due to geographic location restrictions, license requirement, or permission denied) from standard `expired` or `rate_limited` states.

### 2. Client Tools Module

Owned by `src/modules/client-tools/`.

- **Interactive Playground & Inspector**:
  - Components: `ClientToolsChatArea.tsx`, `ClientToolsConfigPanel.tsx`, `ClientToolsInspector.tsx`, `ClientToolsPage.tsx`, `ToolCallCard.tsx`, `ToolDefinitionDialog.tsx`.
  - Service: `services/client-tools-runner.ts`, `presets/default-tools.ts`.
  - Route: `/client-tools` in `src/routes/client-tools.tsx`.
  - Capabilities: Allows running test chat sessions with client-side tool executions, parameter inspections, and response debugging directly through the embedded proxy gateway.

### 3. Proxy Gateway Extensions

Owned by `src/modules/proxy-gateway/server/`.

- **Multi-API-Key Usage Tracking & Telemetry**:
  - Stores & Services: `server/shared/services/proxy-usage.store.ts`, `server/shared/services/proxy-usage.types.ts`, `server/shared/services/request-usage-context.ts` (`setResponseUsage`).
  - Controllers: Token accounting hooks in Anthropic, OpenAI, and Gemini controllers.
  - Behavior: Tracks token usage (prompt, completion, total) per API key across streaming SSE and standard HTTP responses.

- **Custom Account Selection Mode**:
  - Policy & Lease: `account_selection_mode: 'all' | 'custom'` and `selected_account_ids: string[]` in `server/modules/account-lease/account-lease.service.ts`.
  - Behavior: Allows routing proxy requests exclusively through a subset of user-pinned accounts while ignoring unselected accounts.

- **Gateway Landing Page**:
  - Module: `server/modules/landing/landing.controller.ts`, `server/modules/landing/landing-page.template.ts`.
  - Route: Serves an informative HTML landing and diagnostic page on the gateway root.

- **OpenAI Protocol Hardening**:
  - Services: `audio-multipart-request.ts`, `openai-chat-stream-collector.ts`, `openai-request-validation.ts`.
  - Robustness: Hardened WebSocket frame parsing and session durability for OpenAI Responses protocol.

### 4. UI / UX & Multi-Language Localization

- **Sidebar Gauges & Status Indicators**:
  - Component: `src/components/layout/SidebarIndicators.tsx`.
  - Behavior: Real-time visual monitoring of gateway status, active accounts, and quota gauges rendered directly in the desktop sidebar navigation.

- **Full Multi-Language Localization**:
  - Expanded translation resources in `src/localization/`: English (`en.ts`), French (`fr.ts`), Vietnamese (`vi.ts`), Chinese (`zh-CN.ts`), Russian (`ru.ts`), Turkish (`tr.ts`), Portuguese (`pt-BR.ts`), Japanese (`ja.ts`).
  - All language dictionaries must maintain full type parity with `src/localization/en.ts`.

### 5. Packaging & Auto-Update Configuration

- **Windows Compatibility & Build Packaging**:
  - Configuration: `forge.config.ts`, `src/shared/packaging/forgeIgnore.ts`.
  - Ensures cloud accounts and temporary runtime stores are ignored during packaging, and vendor binaries (7-Zip) are preserved.
- **Auto-Update Guard**:
  - `src/modules/app-shell/update/electronUpdaterService.ts`: Auto-update is disabled by default to avoid accidental overwrites of fork modifications with generic upstream releases.

---

## Merge Playbook for Upstream Updates

When performing `git merge upstream/main`, follow these strict rules to resolve conflicts without regressing customizations:

### Standard Merge Workflow

```bash
# 1. Ensure clean worktree and checkout main
git status
git checkout main

# 2. Fetch latest upstream changes and tags
git fetch upstream

# 3. Start merge without auto-committing
git merge upstream/main --no-commit

# 4. Resolve conflicted files following the conflict matrix below
# 5. Run verification checks
pnpm run type-check
pnpm run test:runtime-boundaries
pnpm run test:type-boundaries
pnpm run check:agent-contracts

# 6. Commit and push
git commit -m "Merge branch 'upstream/main' into main with custom features and upstream updates preserved"
git push origin main
```

### Frequent Conflict Resolution Matrix

| File Path | Upstream Intent | Fork Intent | Resolution Rule |
| --------- | --------------- | ----------- | --------------- |
| `src/modules/cloud-account/components/CloudAccountCard.tsx` | Adds health checks, ToS badges, appeal links (`ClearServiceDisabledDialog`), or disabled states (`isAccountDisabled`). | Custom status strip, model generation grouping, quota depth colors, model visibility dropdown, "Mark as In-Use", and "Force Apply". | Wrap quota sections in `{isAccountDisabled ? serviceBlockedNotice : quotaSection}`. Keep model visibility dropdown and generation grouping in quota section. Add appeal buttons to header. Keep `disabled={isSwitching \|\| isAccountDisabled}` on switch actions without disabling `account.is_active_*` so "Force Apply" remains functional. |
| `src/modules/cloud-account/services/CloudMonitorService.ts` | Anti-fraud randomized poll jitter (1500–3500ms), ToS quarantine mutations, eviction on disabled accounts. | Family sibling quota synchronization, `abortableSleep` on shutdown, paused status eviction. | Combine jitter with `this.abortableSleep(pollJitterMs, epoch)`. Keep ToS quarantine branch AND fork's `else if (classified.status === 'paused' \|\| classified.status === 'expired')` eviction. Retain sibling quota sync in success block. |
| `src/modules/cloud-account/services/GoogleAPIService.ts` | Adds synthetic models (e.g. Argon models via `populateSyntheticArgonModels`). | Detects `isForbidden` from `fetchQuotaSummary`. | Call `populateSyntheticArgonModels(result.models, quotaSummary.quotaGroups)` when `quotaSummary?.quotaGroups` exists, AND preserve `result.is_forbidden = true; result.isForbidden = true;` when `quotaSummary?.isForbidden` is true. |
| `src/modules/cloud-account/utils/account-status.ts` | Adds `isServiceDisabledReason` for ToS detection. | Adds `isForbiddenReason` for location/permission ineligibility. | Retain both exported helper functions. In `classifyAccountStatusFromError`, check `isServiceDisabledReason` first, followed by rate limit, OAuth, forbidden, and `isForbiddenReason`. |
| `src/modules/cloud-account/utils/accountValidationStatus.ts` | Adds ToS `Disabled (ToS)` label. | Adds `Forbidden / Ineligible` and `Paused` labels. | Check ToS keywords first, then check `status === 'paused'` and `isForbiddenReason`. |
| `src/modules/proxy-gateway/server/modules/account-lease/account-lease.service.ts` | Filters out `tokenData.service_disabled`. | Filters by custom account selection mode (`account_selection_mode === 'custom'`). | In `fullAccountPool.filter`, check `if (tokenData.service_disabled) return false;` first, then evaluate `accountSelectionMode === 'custom'`, then check `validation_blocked_until_ms`. |
| `src/modules/proxy-gateway/server/modules/*/*.controller.ts` | Adds proxy response timing headers (`setProxyResponseTimingHeaders(res, req)`). | Attaches token usage telemetry (`setResponseUsage(req, ...)`). | In non-streaming branches, call `setProxyResponseTimingHeaders(res, req);` immediately before `setResponseUsage(req, ...)` and `res.status(...).send(result);`. In streaming branches, pass `req` to `writeSseResponse(res, result, req, body.model)`. |
| `src/localization/*.ts` | Adds new keys (e.g. `settings.language.japanese`) only to `en.ts` or new locale files. | Strict TypeScript typing requires exact key parity across all language files. | When upstream adds a key to `en.ts`, immediately add the translated or fallback key to `fr.ts`, `vi.ts`, `pt-BR.ts`, `ru.ts`, `tr.ts`, and `zh-CN.ts`. |
| `src/server/main.ts` | Upstream startup updates. | Custom landing page registration, traffic audit hooks, thought store, and proxy usage stores. | Ensure all custom middleware and stores (`trafficAuditService`, `thoughtStoreService`, `proxyUsageStore`) remain registered in the bootstrap lifecycle. |

---

## Verification Checklist

Always run the following commands before completing any merge from upstream:

1. **Type Safety**:
   ```bash
   pnpm run type-check
   ```
   Must exit with code 0. If localization errors appear, verify key parity across all files in `src/localization/`.

2. **Boundary Invariants**:
   ```bash
   pnpm run test:runtime-boundaries
   pnpm run test:type-boundaries
   ```
   Ensures no process boundary violations (e.g. Node modules imported in renderer) were introduced during the merge.

3. **Governance & Agent Contracts**:
   ```bash
   pnpm run check:agent-contracts
   ```
   Verifies that instruction files, notes, and documentation links remain valid and unbroken.
