import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { CloudAccountRepo } from '@/modules/cloud-account/persistence/cloudHandler';
import { CredentialStoreInjectionAdapter } from '@/modules/cloud-account/persistence/credential-store-injection-adapter';
import { CloudAccountDeviceBindingStore } from '@/modules/cloud-account/persistence/cloud-account-device-binding-store';
import { CloudAccountSettingsStore } from '@/modules/cloud-account/persistence/cloud-account-settings-store';
import {
  FamilyGroupStore,
  type AccountFamilyGroup,
} from '@/modules/cloud-account/persistence/family-group-store';
import {
  GoogleAPIService,
  type OAuthClientDescriptor,
  type TokenResponse,
} from '@/modules/cloud-account/services/GoogleAPIService';
import {
  AutoSwitchModelsConfigSchema,
  CloudAccount,
  CloudAccountExportSchema,
  type AutoSwitchModelConfig,
} from '@/modules/cloud-account/types';
import { logger } from '@/shared/logging/logger';
import { normalizeTrustedGoogleValidationUrl } from '@/modules/cloud-account/utils/google-validation-url';

import { BrowserWindow, shell } from 'electron';
import { IPC_CHANNELS } from '@/shared/constants';
import fs from 'fs';
import { isEmpty, isString } from 'lodash-es';
import { updateTrayMenu } from '@/modules/app-shell/ipc/tray/handler';
import { proxyModelAvailabilityStore } from '@/modules/proxy-gateway/server/shared/services/model-availability.service';
import {
  ensureGlobalOriginalFromCurrentStorage,
  generateDeviceProfile,
  getStorageDirectoryPath,
  isIdentityProfileApplyEnabled,
  loadGlobalOriginalProfile,
  readCurrentDeviceProfile,
  saveGlobalOriginalProfile,
} from '@/modules/identity-profile/ipc/handler';
import { getAntigravityDbPaths, refreshAntigravityProcessCache } from '@/shared/platform/paths';
import { runWithSwitchGuard } from '@/modules/antigravity-runtime/switch/switchGuard';
import { executeSwitchFlow } from '@/modules/antigravity-runtime/switch/switchFlow';
import { getCurrentAccountInfo } from '@/modules/account/public';
import {
  type AntigravityAppTarget,
  resolveAntigravityAppTarget,
} from '@/shared/platform/antigravityAppTarget';
import { readAgyCliToken } from '@/modules/cloud-account/persistence/agyCliTokenReader';
import {
  buildCredentialStorePayload,
  readAntigravityCredentialStoreToken,
  writeAntigravityCredentialStoreToken,
} from '@/modules/cloud-account/persistence/antigravityCredentialStore';
import { writeAgyCliToken } from '@/modules/cloud-account/persistence/agyCliTokenStore';
import { matchAccountFromCredentialToken } from '@/modules/cloud-account/services/accountTokenMatcher';
import { IdeAccountImportAdapter } from '@/modules/cloud-account/persistence/ide-account-import-adapter';
import type { DeviceProfile, DeviceProfilesSnapshot } from '@/modules/identity-profile/types';
import {
  classifyAccountStatusFromError,
  extractErrorMessage,
  isOAuthReauthReason,
} from '@/modules/cloud-account/utils/account-status';
import { withTimingTrace } from '@/shared/observability/timingTrace';
import { AppError } from '@/shared/errors/appError';
import { hasErrorCode } from '@/shared/errors/error-guards';
import { CloudMonitorService } from '@/modules/cloud-account/services/CloudMonitorService';
import { AccountEmulationService } from '@/modules/cloud-account/emulation/AccountEmulationService';
import type {
  AccountEmulationStrategyConfig,
  EmulationPresetType,
  GenerateEmulatedAccountsOptions,
} from '@/modules/cloud-account/emulation/types';
import {
  CLOUD_ACCOUNT_REAUTH_REQUIRED_REASON,
  CloudAccountRefreshBlockedError,
  CloudAccountRefreshService,
  createCloudAccountRefreshRequest,
  isRetryableInvalidGrantRefreshError,
} from '@/modules/cloud-account/services/CloudAccountRefreshService';
import { clearValidationHealthAfterSuccessfulProbe } from '@/modules/cloud-account/services/CloudAccountHealthService';

// Helper to update tray
function notifyTrayUpdate(account: CloudAccount) {
  try {
    // Fetch language setting. Default to 'en' if not set.

    const lang = CloudAccountSettingsStore.getSetting('language', 'en', z.string());
    updateTrayMenu(account, lang);
  } catch (error) {
    logger.warn('Failed to update tray after cloud account update', error);
  }
}

export function broadcastAccountSyncStatus(accountId: string | null): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNT_SYNC_STATUS, { accountId });
      }
    }
  } catch (error) {
    logger.warn('Failed to broadcast account sync status', error);
  }
}

const ACTIVE_OAUTH_CLIENT_KEY_SETTING = 'active_oauth_client_key';
const OAUTH_CLIENT_KEY_BACKFILL_DONE_SETTING = 'oauth_client_key_backfill_v1_done';
const ENTERPRISE_OAUTH_CLIENT_KEY = 'antigravity_enterprise';
const BooleanSettingSchema = z.boolean();
const StringSettingSchema = z.string();

function normalizeAccountEmail(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function mergeRefreshedToken(
  currentToken: CloudAccount['token'],
  refreshedToken: TokenResponse,
  now: number,
): CloudAccount['token'] {
  return {
    ...currentToken,
    access_token: refreshedToken.access_token,
    refresh_token: refreshedToken.refresh_token ?? currentToken.refresh_token,
    expires_in: refreshedToken.expires_in,
    expiry_timestamp: now + refreshedToken.expires_in,
    token_type: refreshedToken.token_type,
    id_token: refreshedToken.id_token ?? currentToken.id_token,
    oauth_client_key: GoogleAPIService.normalizeRefreshedOAuthClientKey(
      currentToken,
      refreshedToken.oauth_client_key,
    ),
  };
}

/**
 * An imported access-token snapshot is not proof of reauthorization: exports intentionally
 * include it, so accepting the same refresh grant again must not lift a durable OAuth block.
 */
function replacesRefreshGrant(
  currentToken: CloudAccount['token'],
  importedToken: CloudAccount['token'] | undefined,
): boolean {
  if (!importedToken) {
    return false;
  }

  const importedRefreshToken = importedToken.refresh_token.trim();
  return importedRefreshToken !== '' && importedRefreshToken !== currentToken.refresh_token.trim();
}

function isEnterpriseClient(clientKey?: string): boolean {
  if (!clientKey) {
    return false;
  }
  return clientKey.trim().toLowerCase() === ENTERPRISE_OAUTH_CLIENT_KEY;
}

function normalizeProjectId(projectId?: string): string | null {
  if (!isString(projectId)) {
    return null;
  }
  const normalized = projectId.trim();
  return normalized === '' ? null : normalized;
}

function recoverCachedQuotaOnRateLimit(
  account: CloudAccount,
  error: unknown,
): CloudAccount['quota'] | null {
  const classified = classifyAccountStatusFromError(error);
  if (!classified || classified.status !== 'rate_limited') {
    return null;
  }
  if (!account.quota || !account.quota.models || Object.keys(account.quota.models).length === 0) {
    return null;
  }
  return account.quota;
}

export function formatSwitchRefreshError(error: unknown): string {
  if (isRetryableInvalidGrantRefreshError(error)) {
    return 'Token refresh was rejected after confirmation. Retry later before reauthorizing the account.';
  }
  if (error instanceof CloudAccountRefreshBlockedError) {
    return 'Token refresh failed repeatedly. Please re-login and complete authorization.';
  }

  const reason = extractErrorMessage(error);
  const normalized = reason.toLowerCase();
  if (
    normalized.includes('unauthorized_client') ||
    normalized.includes('invalid_client') ||
    normalized.includes('invalid_grant')
  ) {
    return `Token refresh failed: OAuth client is not authorized for this account. Please re-login and complete authorization. Raw error: ${reason}`;
  }
  if (
    normalized.includes('verify your account') ||
    normalized.includes('further action is required') ||
    normalized.includes('validation required') ||
    normalized.includes('validation_url') ||
    normalized.includes('appeal_url')
  ) {
    return `Token refresh failed: account requires additional verification. Please finish verification and retry. Raw error: ${reason}`;
  }
  if (
    normalized.includes('resource_exhausted') ||
    normalized.includes('resource has been exhausted')
  ) {
    return `Token refresh failed: account is rate-limited or temporarily restricted (RESOURCE_EXHAUSTED). Please retry later. Raw error: ${reason}`;
  }
  return `Token refresh failed: ${reason}`;
}

async function ensureEnterpriseProjectReady(account: CloudAccount): Promise<void> {
  if (!isEnterpriseClient(account.token.oauth_client_key)) {
    return;
  }

  if (normalizeProjectId(account.token.project_id)) {
    return;
  }

  logger.warn(
    `[OAuth] Account ${account.email} is using enterprise OAuth client but missing project_id. Resolving before switch...`,
  );

  try {
    const resolvedProjectId = await GoogleAPIService.fetchProjectId(
      account.token.access_token,
      account.proxy_url,
    );
    const normalizedProjectId = normalizeProjectId(resolvedProjectId ?? undefined);
    if (normalizedProjectId) {
      account.token.project_id = normalizedProjectId;
      await CloudAccountRepo.updateToken(account.id, account.token);
      logger.info(`[OAuth] Successfully resolved and saved project_id for ${account.email}`);
    } else {
      logger.warn(
        `[OAuth] Project ID is unavailable for ${account.email}; continuing switch without blocking.`,
      );
    }
  } catch (error) {
    logger.warn(
      `[OAuth] Failed to auto-resolve project ID for ${account.email} during switch: ${extractErrorMessage(
        error,
      )}. Continuing switch without blocking.`,
    );
  }
}

async function markAccountStatusFromError(account: CloudAccount, error: unknown): Promise<void> {
  if (isRetryableInvalidGrantRefreshError(error)) {
    return;
  }
  if (error instanceof CloudAccountRefreshBlockedError) {
    account.status = 'expired';
    account.status_reason = CLOUD_ACCOUNT_REAUTH_REQUIRED_REASON;
    await CloudAccountRepo.setAccountStatus(
      account.id,
      'expired',
      CLOUD_ACCOUNT_REAUTH_REQUIRED_REASON,
    );
    return;
  }

  const classified = classifyAccountStatusFromError(error);
  if (!classified) {
    return;
  }

  account.status = classified.status;
  account.status_reason = classified.reason;
  await CloudAccountRepo.setAccountStatus(account.id, classified.status, classified.reason);
  if (classified.status === 'paused' || classified.status === 'expired') {
    const { evictAccountFromActiveLeaseCache } = await import(
      '../services/CloudAccountHealthService'
    );
    await evictAccountFromActiveLeaseCache(account.id);
  }
}

async function clearAccountStatus(account: CloudAccount): Promise<void> {
  account.status = 'active';
  account.status_reason = undefined;
  await CloudAccountRepo.setAccountStatus(account.id, 'active', null);
}

function hydrateActiveOAuthClientFromSettings(): void {
  const preferredClientKey = CloudAccountSettingsStore.getSetting(
    ACTIVE_OAUTH_CLIENT_KEY_SETTING,
    '',
    StringSettingSchema,
  );
  if (isString(preferredClientKey) && !isEmpty(preferredClientKey.trim())) {
    try {
      GoogleAPIService.setActiveOAuthClientKey(preferredClientKey);
    } catch (error) {
      logger.warn(
        `[OAuth] Stored active OAuth client '${preferredClientKey}' is invalid, falling back to default`,
        error,
      );
      CloudAccountSettingsStore.setSetting(ACTIVE_OAUTH_CLIENT_KEY_SETTING, '');
    }
  }
}

async function backfillMissingOAuthClientKeyForLegacyAccounts(
  accounts: CloudAccount[],
): Promise<boolean> {
  const backfillDone = CloudAccountSettingsStore.getSetting(
    OAUTH_CLIENT_KEY_BACKFILL_DONE_SETTING,
    false,
    BooleanSettingSchema,
  );
  if (backfillDone) {
    return false;
  }

  hydrateActiveOAuthClientFromSettings();
  const activeClientKey = GoogleAPIService.getActiveOAuthClientKey().trim().toLowerCase();
  if (activeClientKey === '') {
    return false;
  }

  let updatedCount = 0;
  let skippedEnterpriseGuardCount = 0;
  let hasFailure = false;

  for (const account of accounts) {
    if (account.provider !== 'google') {
      continue;
    }

    const currentClientKey = account.token.oauth_client_key?.trim();
    if (currentClientKey) {
      continue;
    }

    const refreshToken = account.token.refresh_token?.trim();
    if (!refreshToken) {
      continue;
    }

    const projectMissing =
      !isString(account.token.project_id) || isEmpty(account.token.project_id.trim());
    if (activeClientKey === ENTERPRISE_OAUTH_CLIENT_KEY && projectMissing) {
      skippedEnterpriseGuardCount += 1;
      continue;
    }

    try {
      await CloudAccountRepo.updateToken(account.id, {
        ...account.token,
        oauth_client_key: activeClientKey,
      });
      updatedCount += 1;
    } catch (error) {
      hasFailure = true;
      logger.warn(
        `[OAuth] Failed to backfill oauth_client_key for account ${account.email} (${account.id})`,
        error,
      );
    }
  }

  if (!hasFailure) {
    CloudAccountSettingsStore.setSetting(OAUTH_CLIENT_KEY_BACKFILL_DONE_SETTING, true);
  }

  logger.info(
    `[OAuth] Backfill oauth_client_key completed: updated=${updatedCount}, skipped_enterprise_guard=${skippedEnterpriseGuardCount}, has_failure=${hasFailure}`,
  );

  return updatedCount > 0;
}

export async function addGoogleAccount(
  authCode: string,
  oauthClientKey?: string,
): Promise<CloudAccount> {
  try {
    logger.info(
      `[OAuth] addGoogleAccount invoked with clientKey=${oauthClientKey}, authCode length=${authCode?.length}`,
    );
    if (isString(oauthClientKey) && !isEmpty(oauthClientKey.trim())) {
      setActiveOAuthClient(oauthClientKey);
    } else {
      hydrateActiveOAuthClientFromSettings();
    }

    // 1. Exchange code for tokens
    logger.info('[OAuth] Exchanging auth code for tokens...');
    const tokenResp = await GoogleAPIService.exchangeCode(authCode, undefined, oauthClientKey);
    logger.info(`[OAuth] Token exchange successful for client=${tokenResp.oauth_client_key}`);

    // 2. Get User Info
    logger.info('[OAuth] Requesting user info...');
    const userInfo = await GoogleAPIService.getUserInfo(tokenResp.access_token);
    logger.info(`[OAuth] Retreived user info: email=${userInfo.email}`);

    // 3. Check for existing account
    const existing = await CloudAccountRepo.getAccountByEmail(userInfo.email);
    if (existing) {
      throw new Error(`Account with email ${userInfo.email} already exists.`);
    }

    // 4. Construct CloudAccount Object
    const now = Math.floor(Date.now() / 1000);
    const account: CloudAccount = {
      id: uuidv4(),
      provider: 'google',
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
      avatar_url: userInfo.picture,
      token: {
        access_token: tokenResp.access_token,
        refresh_token: tokenResp.refresh_token || '',
        expires_in: tokenResp.expires_in,
        expiry_timestamp: now + tokenResp.expires_in,
        token_type: tokenResp.token_type,
        email: userInfo.email,
        oauth_client_key: tokenResp.oauth_client_key,
        is_gcp_tos: false,
        id_token: tokenResp.id_token,
      },
      created_at: now,
      last_used: now,
    };

    if (!account.token.refresh_token) {
      logger.warn(`No refresh token received for ${account.email}. Account will expire in 1 hour.`);
    }

    await CloudAccountRepo.addAccount(account);
    await CloudAccountRefreshService.clearFailureState(account.id);

    try {
      const quota = await GoogleAPIService.fetchQuota(account.token.access_token);
      try {
        const aiCredits = await GoogleAPIService.fetchAICredits(
          account.token.access_token,
          undefined,
        );
        if (aiCredits) {
          quota.ai_credits = aiCredits;
        } else {
          logger.info(`No AI credits returned for ${account.email} during initial sync`);
        }
      } catch (error) {
        logger.warn('Failed to fetch initial AI credits', error);
      }
      account.quota = quota;
      await CloudAccountRepo.updateQuota(account.id, account.quota);
      notifyTrayUpdate(account);
    } catch (error) {
      logger.warn('Failed to fetch initial quota', error);
    }

    return account;
  } catch (error) {
    logger.error('Failed to add Google account', error);
    throw error;
  }
}

export async function listCloudAccounts(): Promise<CloudAccount[]> {
  let accounts = await CloudAccountRepo.getAccounts();
  const backfilled = await backfillMissingOAuthClientKeyForLegacyAccounts(accounts);
  if (backfilled) {
    accounts = await CloudAccountRepo.getAccounts();
  }

  await Promise.all([
    refreshAntigravityProcessCache('classic'),
    refreshAntigravityProcessCache('ide'),
  ]);

  let classicEmail = '';
  let ideEmail = '';
  try {
    const classicInfo = getCurrentAccountInfo('classic');
    if (classicInfo.isAuthenticated) {
      classicEmail = normalizeAccountEmail(classicInfo.email);
    }
  } catch (err) {
    logger.warn('Failed to read current classic account info during listing', err);
  }
  const classicUsesCredentialStore =
    CredentialStoreInjectionAdapter.shouldInjectTokenIntoCredentialStore('classic');

  // 1. Resolve live or effective active classic account
  let effectiveActiveClassicAccountId = '';
  if (classicUsesCredentialStore) {
    try {
      const credToken = readAntigravityCredentialStoreToken();
      if (credToken) {
        const matched = await matchAccountFromCredentialToken(credToken, accounts);
        if (matched) {
          effectiveActiveClassicAccountId = matched.id;
          CloudAccountSettingsStore.setActiveForTarget('classic', matched.id);
        }
      }
    } catch {
      // Best-effort check
    }
  }
  if (!effectiveActiveClassicAccountId && classicEmail) {
    const matched = accounts.find((acc) => normalizeAccountEmail(acc.email) === classicEmail);
    if (matched) {
      effectiveActiveClassicAccountId = matched.id;
      CloudAccountSettingsStore.setActiveForTarget('classic', matched.id);
    }
  }
  if (!effectiveActiveClassicAccountId) {
    effectiveActiveClassicAccountId =
      CloudAccountSettingsStore.getActiveAccountIdForTarget('classic');
  }

  try {
    const ideInfo = getCurrentAccountInfo('ide');
    if (ideInfo.isAuthenticated) {
      ideEmail = normalizeAccountEmail(ideInfo.email);
    }
  } catch (err) {
    logger.warn('Failed to read current ide account info during listing', err);
  }

  // 2. Resolve live or effective active IDE account
  let effectiveActiveIdeAccountId = '';
  if (ideEmail) {
    const matched = accounts.find((acc) => normalizeAccountEmail(acc.email) === ideEmail);
    if (matched) {
      effectiveActiveIdeAccountId = matched.id;
      CloudAccountSettingsStore.setActiveForTarget('ide', matched.id);
    }
  }
  if (!effectiveActiveIdeAccountId) {
    try {
      const dbPaths = getAntigravityDbPaths('ide');
      for (const dbPath of dbPaths) {
        if (fs.existsSync(dbPath)) {
          try {
            const ideToken = IdeAccountImportAdapter.readTokenInfoFromPath(dbPath);
            if (ideToken) {
              const matched = await matchAccountFromCredentialToken(ideToken, accounts);
              if (matched) {
                effectiveActiveIdeAccountId = matched.id;
                CloudAccountSettingsStore.setActiveForTarget('ide', matched.id);
                break;
              }
            }
          } catch {
            // Best-effort check
          }
        }
      }
    } catch {
      // Best-effort check
    }
  }
  if (!effectiveActiveIdeAccountId) {
    effectiveActiveIdeAccountId = CloudAccountSettingsStore.getActiveAccountIdForTarget('ide');
  }

  // 3. Resolve live or effective active CLI account
  let effectiveActiveAgyAccountId = '';
  try {
    const cliToken = readAgyCliToken();
    if (cliToken) {
      const matched = await matchAccountFromCredentialToken(cliToken, accounts);
      if (matched) {
        effectiveActiveAgyAccountId = matched.id;
        CloudAccountSettingsStore.setActiveForTarget('agy', matched.id);
      }
    }
  } catch {
    // Best-effort check
  }
  if (!effectiveActiveAgyAccountId) {
    effectiveActiveAgyAccountId = CloudAccountSettingsStore.getActiveAccountIdForTarget('agy');
  }

  const mappedRealAccounts = accounts.map((account) => {
    const accountEmail = normalizeAccountEmail(account.email);
    const isClassicActive =
      effectiveActiveClassicAccountId === account.id ||
      (!effectiveActiveClassicAccountId && classicEmail === accountEmail);
    const isIdeActive =
      effectiveActiveIdeAccountId === account.id ||
      (!effectiveActiveIdeAccountId && ideEmail === accountEmail);
    const isAgyActive = effectiveActiveAgyAccountId === account.id;
    return {
      ...account,
      is_active: isClassicActive || isIdeActive || isAgyActive,
      is_active_classic: isClassicActive,
      is_active_ide: isIdeActive,
      is_active_agy: isAgyActive,
    };
  });

  if (AccountEmulationService.isEnabled()) {
    const emulatedAccounts = AccountEmulationService.getCloudAccounts();
    return [...mappedRealAccounts, ...emulatedAccounts];
  }

  return mappedRealAccounts;
}

export async function deleteCloudAccount(accountId: string): Promise<void> {
  if (AccountEmulationService.isEmulated(accountId)) {
    AccountEmulationService.deleteAccount(accountId);
    return;
  }
  await CloudAccountRepo.removeAccount(accountId);
}

export async function togglePauseCloudAccount(
  accountId: string,
  paused: boolean,
): Promise<CloudAccount> {
  const account = await CloudAccountRepo.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  if (paused) {
    account.status = 'paused';
    account.status_reason = 'Paused by user';
    await CloudAccountRepo.setAccountStatus(accountId, 'paused', 'Paused by user');
    const { evictAccountFromActiveLeaseCache } = await import(
      '../services/CloudAccountHealthService'
    );
    await evictAccountFromActiveLeaseCache(accountId);
  } else {
    account.status = 'active';
    account.status_reason = undefined;
    await CloudAccountRepo.setAccountStatus(accountId, 'active', null);
    const { reloadNestServerAccountLeaseCache } = await import('@/server/main');
    await reloadNestServerAccountLeaseCache();
  }

  return account;
}

export async function batchSetCloudAccountsPaused(
  accountIds: string[],
  paused: boolean,
): Promise<CloudAccount[]> {
  const results: CloudAccount[] = [];
  for (const accountId of accountIds) {
    try {
      const updated = await togglePauseCloudAccount(accountId, paused);
      results.push(updated);
    } catch (error) {
      logger.error(`Failed to set pause status for account ${accountId}`, error);
    }
  }
  return results;
}

async function syncFamilyQuotaToSiblings(
  accountId: string,
  quota: CloudAccount['quota'],
): Promise<void> {
  if (!quota) {
    return;
  }
  const familyGroup = FamilyGroupStore.getFamilyGroupByAccountId(accountId);
  if (!familyGroup) {
    return;
  }

  const siblingIds = familyGroup.accountIds.filter((id) => id !== accountId);
  for (const siblingId of siblingIds) {
    try {
      await CloudAccountRepo.updateQuota(siblingId, quota);
      await CloudAccountRepo.setAccountStatus(siblingId, 'active', null);
      proxyModelAvailabilityStore.clearCapabilityFailures(siblingId);
      logger.info(
        `Synchronized family quota from account ${accountId} to sibling account ${siblingId}`,
      );
    } catch (error) {
      logger.warn(`Failed to sync family quota to sibling account ${siblingId}`, error);
    }
  }
}

export async function openAccountValidationLink(accountId: string): Promise<void> {
  const account = await CloudAccountRepo.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }
  const validationUrl = normalizeTrustedGoogleValidationUrl(
    account.health?.validation?.verification_url,
  );
  if (!validationUrl) {
    throw new Error('No trusted validation URL is available for this account');
  }
  await shell.openExternal(validationUrl);
}


export async function refreshAccountQuota(accountId: string): Promise<CloudAccount> {
  if (AccountEmulationService.isEmulated(accountId)) {
    return AccountEmulationService.refreshAccountQuota(accountId);
  }
  const account = await CloudAccountRepo.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  broadcastAccountSyncStatus(account.id);
  try {
    let now = Math.floor(Date.now() / 1000);
  if (account.token.expiry_timestamp < now + 300) {
    logger.info(`Token for ${account.email} near expiry, refreshing...`);
    try {
      const refreshedToken = await CloudAccountRefreshService.refreshAccessToken(
        createCloudAccountRefreshRequest(account),
      );

      account.token = mergeRefreshedToken(account.token, refreshedToken, now);
      await CloudAccountRepo.updateToken(account.id, account.token);
    } catch (error) {
      logger.warn(
        `Failed to refresh token during quota refresh precheck for ${account.email}`,
        error,
      );
      await markAccountStatusFromError(account, error);
      if (isRetryableInvalidGrantRefreshError(error)) {
        throw error;
      }
      throw new AppError('CLOUD_ACCOUNT_LOGIN_EXPIRED', 'Cloud account login expired', {
        messageKey: 'error.cloudAccountLoginExpired',
        reportToSentry: false,
        transportCode: 'UNAUTHORIZED',
        metadata: {
          accountId: account.id,
          email: account.email,
        },
        cause: error,
      });
    }
  }

  try {
    const previousAICredits = account.quota?.ai_credits;
    const quota = await GoogleAPIService.fetchQuota(account.token.access_token, account.proxy_url);

    try {
      const aiCredits = await GoogleAPIService.fetchAICredits(
        account.token.access_token,
        account.proxy_url,
      );
      if (aiCredits) {
        quota.ai_credits = aiCredits;
      } else {
        logger.info(`No AI credits returned for ${account.email} during quota refresh`);
        if (previousAICredits) {
          quota.ai_credits = previousAICredits;
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch AI credits during quota refresh', error);
      if (previousAICredits) {
        quota.ai_credits = previousAICredits;
      }
    }

    account.quota = quota;
    await CloudAccountRepo.updateQuota(account.id, account.quota);
    await syncFamilyQuotaToSiblings(account.id, account.quota);
    await CloudAccountRepo.updateLastUsed(account.id);
    account.last_used = Math.floor(Date.now() / 1000);

    if (quota.is_forbidden || quota.isForbidden) {
      logger.warn(
        `Account ${account.email} is forbidden / ineligible for quota summary; auto-pausing account.`,
      );
      const pauseReason =
        'Google account forbidden or ineligible for Cloud Code Assist (no weekly quota)';
      await CloudAccountRepo.setAccountStatus(account.id, 'paused', pauseReason);
      account.status = 'paused';
      account.status_reason = pauseReason;
      const { evictAccountFromActiveLeaseCache } = await import(
        '../services/CloudAccountHealthService'
      );
      await evictAccountFromActiveLeaseCache(account.id);
      return account;
    }

    await clearAccountStatus(account);
    await clearValidationHealthAfterSuccessfulProbe(account);
    proxyModelAvailabilityStore.clearCapabilityFailures(account.id);
    notifyTrayUpdate(account);
    CloudMonitorService.scheduleWeeklyWarmup([account]);
    return account;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage === 'UNAUTHORIZED') {
      logger.warn(`Received 401 Unauthorized for ${account.email}; forcing token refresh`);
      try {
        const refreshedToken = await CloudAccountRefreshService.refreshAccessToken(
          createCloudAccountRefreshRequest(account),
        );
        now = Math.floor(Date.now() / 1000);

        account.token = mergeRefreshedToken(account.token, refreshedToken, now);
        await CloudAccountRepo.updateToken(account.id, account.token);

        const previousAICredits = account.quota?.ai_credits;
        const quota = await GoogleAPIService.fetchQuota(
          account.token.access_token,
          account.proxy_url,
        );

        try {
          const aiCredits = await GoogleAPIService.fetchAICredits(
            account.token.access_token,
            account.proxy_url,
          );
          if (aiCredits) {
            quota.ai_credits = aiCredits;
          } else {
            logger.info(`No AI credits returned for ${account.email} after token refresh`);
            if (previousAICredits) {
              quota.ai_credits = previousAICredits;
            }
          }
        } catch (error) {
          logger.warn('Failed to fetch AI credits after token refresh', error);
          if (previousAICredits) {
            quota.ai_credits = previousAICredits;
          }
        }

        account.quota = quota;
        await CloudAccountRepo.updateQuota(account.id, account.quota);
        await syncFamilyQuotaToSiblings(account.id, account.quota);
        await CloudAccountRepo.updateLastUsed(account.id);
        account.last_used = Math.floor(Date.now() / 1000);

        if (quota.is_forbidden || quota.isForbidden) {
          logger.warn(
            `Account ${account.email} is forbidden / ineligible for quota summary; auto-pausing account.`,
          );
          const pauseReason =
            'Google account forbidden or ineligible for Cloud Code Assist (no weekly quota)';
          await CloudAccountRepo.setAccountStatus(account.id, 'paused', pauseReason);
          account.status = 'paused';
          account.status_reason = pauseReason;
          const { evictAccountFromActiveLeaseCache } = await import(
            '../services/CloudAccountHealthService'
          );
          await evictAccountFromActiveLeaseCache(account.id);
          return account;
        }

        await clearAccountStatus(account);
        await clearValidationHealthAfterSuccessfulProbe(account);
        proxyModelAvailabilityStore.clearCapabilityFailures(account.id);
        CloudMonitorService.scheduleWeeklyWarmup([account]);
        return account;
      } catch (refreshError) {
        logger.error(
          `Failed to force refresh token or retry quota for ${account.email}`,
          refreshError,
        );
        const cachedQuota = recoverCachedQuotaOnRateLimit(account, refreshError);
        if (cachedQuota) {
          logger.warn(
            `[OAuth] Quota request is rate-limited for ${account.email}; reusing cached quota as fallback.`,
          );
          await markAccountStatusFromError(account, refreshError);
          return account;
        }
        await markAccountStatusFromError(account, refreshError);
        throw refreshError;
      }
    } else if (errorMessage === 'FORBIDDEN') {
      logger.warn(`Received 403 Forbidden for ${account.email}; marking account status from error`);
      await markAccountStatusFromError(account, error);
      return account;
    }

    const cachedQuota = recoverCachedQuotaOnRateLimit(account, error);
    if (cachedQuota) {
      logger.warn(
        `[OAuth] Quota request is rate-limited for ${account.email}; reusing cached quota as fallback.`,
      );
      await markAccountStatusFromError(account, error);
      return account;
    }

    await markAccountStatusFromError(account, error);
    logger.error(`Failed to refresh quota for ${account.email}`, error);
    throw error;
  }
} finally {
  broadcastAccountSyncStatus(null);
}
}

export async function switchCloudAccount(
  accountId: string,
  appTarget?: AntigravityAppTarget,
): Promise<void> {
  if (AccountEmulationService.isEmulated(accountId)) {
    AccountEmulationService.switchAccount(accountId);
    logger.info(`Switched to emulated account: ${accountId}`);
    return;
  }
  await runWithSwitchGuard('cloud-account-switch', async () => {
    try {
      const account = await CloudAccountRepo.getAccount(accountId);
      if (!account) {
        throw new Error(`Account not found: ${accountId}`);
      }

      logger.info(`Switching to cloud account: ${account.email} (${account.id})`);
      const usesCredentialStore =
        CredentialStoreInjectionAdapter.shouldInjectTokenIntoCredentialStore(appTarget);
      await withTimingTrace(
        'switch.cloud.prepare',
        {
          accountId: account.id,
          appTarget: appTarget || 'classic',
        },
        async (trace) => {
          await trace.phase('refreshProcessCacheMs', async () => {
            await refreshAntigravityProcessCache(appTarget);
          });

          trace.phaseSync('deviceProfileSetupMs', () => {
            if (appTarget !== 'agy') {
              ensureGlobalOriginalFromCurrentStorage(appTarget);
            }

            if (!account.device_profile) {
              const generated = generateDeviceProfile();
              CloudAccountDeviceBindingStore.setDeviceBinding(
                account.id,
                generated,
                'auto_generated',
              );
              saveGlobalOriginalProfile(generated);
              account.device_profile = generated;
            }
          });

          const tokenRefreshPromise = (async () => {
            const now = Math.floor(Date.now() / 1000);
            if (
              !isString(account.token.refresh_token) ||
              isEmpty(account.token.refresh_token.trim())
            ) {
              logger.warn(
                `Token for ${account.email} has no refresh token; switched IDE session may expire without recovery.`,
              );
              return;
            }

            logger.info(`Refreshing token for ${account.email} before IDE injection...`);
            try {
              const refreshedToken = await CloudAccountRefreshService.refreshAccessToken(
                createCloudAccountRefreshRequest(account),
              );

              const updatedToken = mergeRefreshedToken(account.token, refreshedToken, now);
              await CloudAccountRepo.updateToken(account.id, updatedToken);

              account.token = updatedToken;
              logger.info(`Token refreshed for ${account.email}`);
            } catch (error) {
              logger.warn('Failed to refresh token before IDE injection', error);
              await markAccountStatusFromError(account, error);
              throw new Error(formatSwitchRefreshError(error));
            }
          })();

          await trace.phase('tokenRefreshMs', async () => {
            await tokenRefreshPromise;
          });

          await trace.phase('enterpriseProjectReadyMs', async () => {
            await ensureEnterpriseProjectReady(account);
          });
        },
      );

      await executeSwitchFlow({
        scope: 'cloud',
        appTarget,
        targetProfile: account.device_profile || null,
        applyFingerprint: isIdentityProfileApplyEnabled(),
        useCredentialStore: usesCredentialStore,
        processExitTimeoutMs: 10000,
        skipRefreshProcessCache: true,
        performSwitch: async () => {
          const injectionMode = usesCredentialStore ? 'credential-store' : 'sqlite';

          if (injectionMode === 'sqlite') {
            // 3. Backup Database (Optimized to avoid race conditions)
            const dbPaths = getAntigravityDbPaths(appTarget);
            for (const dbPath of dbPaths) {
              try {
                const backupPath = `${dbPath}.backup`;
                await fs.promises.copyFile(dbPath, backupPath);
                logger.info(`Backed up database to ${backupPath}`);
                break; // Success, stop trying other paths
              } catch (error) {
                // If file not found, just try the next path
                if (hasErrorCode(error, 'ENOENT')) {
                  continue;
                }
                logger.error(`Failed to backup database at ${dbPath}`, error);
              }
            }
          }

          // 4. Inject Token
          CredentialStoreInjectionAdapter.injectCloudTokenWithStorageStrategy(account, appTarget);
        },
        afterSwitchSuccess: async () => {
          CloudAccountRepo.updateLastUsed(account.id);
          CloudAccountRepo.setActive(account.id);
          CloudAccountSettingsStore.setActiveForTarget(appTarget, account.id);
          await clearAccountStatus(account);

          logger.info(`Successfully switched to cloud account: ${account.email}`);
          notifyTrayUpdate(account);
        },
      });
    } catch (error) {
      logger.error('Failed to switch cloud account', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Switch failed: ${errorMessage || 'Unknown error'}`);
    }
  });
}

export interface DetectedActiveAccountsResult {
  classic: { accountId: string; email: string } | null;
  ide: { accountId: string; email: string } | null;
  agy: { accountId: string; email: string } | null;
}

export async function markActiveAccount(
  accountId: string,
  appTarget?: AntigravityAppTarget,
): Promise<CloudAccount> {
  const account = await CloudAccountRepo.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const normalizedTarget = resolveAntigravityAppTarget(appTarget);
  CloudAccountSettingsStore.setActiveForTarget(normalizedTarget, account.id);
  CloudAccountRepo.setActive(account.id);
  CloudAccountRepo.updateLastUsed(account.id);

  // Best-effort credential synchronization without restarting any running processes
  if (normalizedTarget === 'agy') {
    try {
      const payload = buildCredentialStorePayload({
        access_token: account.token.access_token,
        refresh_token: account.token.refresh_token,
        expiry_timestamp: account.token.expiry_timestamp,
      });
      writeAgyCliToken(payload);
      logger.info(`Synchronized CLI token for marked active account: ${account.email}`);
    } catch (err) {
      logger.warn('Failed to synchronize CLI token for marked account', err);
    }
  } else {
    const usesCredentialStore =
      CredentialStoreInjectionAdapter.shouldInjectTokenIntoCredentialStore(normalizedTarget);
    if (usesCredentialStore) {
      try {
        writeAntigravityCredentialStoreToken(
          {
            access_token: account.token.access_token,
            refresh_token: account.token.refresh_token,
            expiry_timestamp: account.token.expiry_timestamp,
          },
          { syncGoogleOAuthFiles: true, email: account.email, syncAgyCliToken: false },
        );
        logger.info(
          `Synchronized credential store token for marked active account: ${account.email}`,
        );
      } catch (err) {
        logger.warn('Failed to synchronize credential store token for marked account', err);
      }
    } else {
      try {
        CredentialStoreInjectionAdapter.injectCloudToken(account, normalizedTarget);
        logger.info(
          `Synchronized SQLite token for marked active account: ${account.email}`,
        );
      } catch (err) {
        logger.warn('Failed to synchronize SQLite token for marked account', err);
      }
    }
  }

  notifyTrayUpdate(account);
  return account;
}

export async function detectActiveAccounts(): Promise<DetectedActiveAccountsResult> {
  const accounts = await CloudAccountRepo.getAccounts();
  const result: DetectedActiveAccountsResult = {
    classic: null,
    ide: null,
    agy: null,
  };

  const findAccountByEmail = (email?: string) => {
    if (!email) return undefined;
    const normalized = normalizeAccountEmail(email);
    return accounts.find((acc) => normalizeAccountEmail(acc.email) === normalized);
  };

  // 1. Detect Antigravity CLI (`agy`)
  try {
    const cliToken = readAgyCliToken();
    if (cliToken) {
      const agyAccount = await matchAccountFromCredentialToken(cliToken, accounts);
      if (agyAccount) {
        CloudAccountSettingsStore.setActiveForTarget('agy', agyAccount.id);
        result.agy = { accountId: agyAccount.id, email: agyAccount.email };
      }
    }
  } catch (err) {
    logger.warn('Failed to detect active Antigravity CLI account', err);
  }

  // 2. Detect Antigravity IDE (`ide`)
  try {
    let ideAccount: CloudAccount | undefined;
    // Step 2a: Check SQLite state first (primary storage for IDE)
    try {
      const ideInfo = getCurrentAccountInfo('ide');
      if (ideInfo.isAuthenticated && ideInfo.email) {
        ideAccount = findAccountByEmail(ideInfo.email);
      }
    } catch {
      // ignore
    }

    // Step 2b: If not resolved by email, check SQLite token directly via IdeAccountImportAdapter
    if (!ideAccount) {
      try {
        const dbPaths = getAntigravityDbPaths('ide');
        for (const dbPath of dbPaths) {
          if (fs.existsSync(dbPath)) {
            try {
              const ideToken = IdeAccountImportAdapter.readTokenInfoFromPath(dbPath);
              if (ideToken) {
                ideAccount = await matchAccountFromCredentialToken(ideToken, accounts);
                if (ideAccount) {
                  break;
                }
              }
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // Step 2c: Fallback to Credential Store only if SQLite has no active account
    if (!ideAccount) {
      try {
        const credToken = readAntigravityCredentialStoreToken();
        if (credToken) {
          ideAccount = await matchAccountFromCredentialToken(credToken, accounts);
        }
      } catch {
        // ignore
      }
    }

    if (ideAccount) {
      CloudAccountSettingsStore.setActiveForTarget('ide', ideAccount.id);
      result.ide = { accountId: ideAccount.id, email: ideAccount.email };
    }
  } catch (err) {
    logger.warn('Failed to detect active Antigravity IDE account', err);
  }

  // 3. Detect Antigravity Classic (`classic`)
  try {
    let classicAccount: CloudAccount | undefined;
    const classicUsesCredentialStore =
      CredentialStoreInjectionAdapter.shouldInjectTokenIntoCredentialStore('classic');

    if (classicUsesCredentialStore) {
      try {
        const credToken = readAntigravityCredentialStoreToken();
        if (credToken) {
          classicAccount = await matchAccountFromCredentialToken(credToken, accounts);
        }
      } catch {
        // Credential store might be unavailable or empty
      }
    }

    if (!classicAccount) {
      try {
        const classicInfo = getCurrentAccountInfo('classic');
        if (classicInfo.isAuthenticated && classicInfo.email) {
          classicAccount = findAccountByEmail(classicInfo.email);
        }
      } catch {
        // SQLite state might not exist
      }
    }

    if (!classicAccount && !classicUsesCredentialStore) {
      try {
        const credToken = readAntigravityCredentialStoreToken();
        if (credToken) {
          classicAccount = await matchAccountFromCredentialToken(credToken, accounts);
        }
      } catch {
        // ignore
      }
    }

    if (classicAccount) {
      CloudAccountSettingsStore.setActiveForTarget('classic', classicAccount.id);
      result.classic = { accountId: classicAccount.id, email: classicAccount.email };
    }
  } catch (err) {
    logger.warn('Failed to detect active Antigravity Classic account', err);
  }

  return result;
}

export async function getCloudIdentityProfiles(accountId: string): Promise<DeviceProfilesSnapshot> {
  const account = await CloudAccountRepo.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  let currentStorage: DeviceProfile | undefined;
  try {
    currentStorage = readCurrentDeviceProfile();
  } catch (error) {
    logger.warn('Failed to read current storage device profile', error);
  }

  return {
    currentStorage,
    boundProfile: account.device_profile,
    history: account.device_history || [],
    baseline: loadGlobalOriginalProfile() || undefined,
  };
}

export async function previewGenerateCloudIdentityProfile(): Promise<DeviceProfile> {
  return generateDeviceProfile();
}

export async function bindCloudIdentityProfile(
  accountId: string,
  mode: 'capture' | 'generate',
): Promise<DeviceProfile> {
  const account = await CloudAccountRepo.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  let profile: DeviceProfile;
  if (mode === 'capture') {
    profile = readCurrentDeviceProfile();
  } else {
    profile = generateDeviceProfile();
  }

  ensureGlobalOriginalFromCurrentStorage();
  saveGlobalOriginalProfile(profile);
  CloudAccountDeviceBindingStore.setDeviceBinding(account.id, profile, mode);

  return profile;
}

export async function bindCloudIdentityProfileWithPayload(
  accountId: string,
  profile: DeviceProfile,
): Promise<DeviceProfile> {
  const account = await CloudAccountRepo.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  ensureGlobalOriginalFromCurrentStorage();
  saveGlobalOriginalProfile(profile);
  CloudAccountDeviceBindingStore.setDeviceBinding(account.id, profile, 'generated');

  return profile;
}

export async function restoreCloudIdentityProfileRevision(
  accountId: string,
  versionId: string,
): Promise<DeviceProfile> {
  const baseline = loadGlobalOriginalProfile();
  return CloudAccountDeviceBindingStore.restoreDeviceVersion(accountId, versionId, baseline);
}

export async function restoreCloudBaselineProfile(accountId: string): Promise<DeviceProfile> {
  const baseline = loadGlobalOriginalProfile();
  if (!baseline) {
    throw new Error('Global original profile not found');
  }
  return CloudAccountDeviceBindingStore.restoreDeviceVersion(accountId, 'baseline', baseline);
}

export async function deleteCloudIdentityProfileRevision(
  accountId: string,
  versionId: string,
): Promise<void> {
  CloudAccountDeviceBindingStore.deleteDeviceVersion(accountId, versionId);
}

export async function openCloudIdentityStorageFolder(): Promise<void> {
  const directory = getStorageDirectoryPath();
  const result = await shell.openPath(directory);
  if (result) {
    throw new Error(`Failed to open identity storage: ${result}`);
  }
}

export interface AutoSwitchTargetsConfig {
  classic: boolean;
  ide: boolean;
  agy: boolean;
  global: boolean;
  noRestart: boolean;
}

export function getAutoSwitchTargetsConfig(): AutoSwitchTargetsConfig {
  return {
    classic: CloudAccountSettingsStore.getAutoSwitchEnabledForTarget('classic'),
    ide: CloudAccountSettingsStore.getAutoSwitchEnabledForTarget('ide'),
    agy: CloudAccountSettingsStore.getAutoSwitchEnabledForTarget('agy'),
    global: CloudAccountSettingsStore.getSetting<boolean>('auto_switch_enabled', false, BooleanSettingSchema),
    noRestart: CloudAccountSettingsStore.isNoRestartEnabled(),
  };
}

export function getAutoSwitchEnabled(target?: AntigravityAppTarget): boolean {
  return CloudAccountSettingsStore.getAutoSwitchEnabledForTarget(target);
}

export async function setAutoSwitchEnabled(
  enabled: boolean,
  target?: AntigravityAppTarget,
): Promise<void> {
  CloudAccountSettingsStore.setAutoSwitchEnabledForTarget(target, enabled);
  CloudMonitorService.syncSchedule();
  // Trigger an immediate check if enabled
  if (enabled) {
    CloudMonitorService.poll().catch((error: unknown) =>
      logger.error('Failed to poll after enabling auto-switch', error),
    );
  }
}

export function setAutoSwitchNoRestartEnabled(enabled: boolean): void {
  CloudAccountSettingsStore.setNoRestartEnabled(enabled);
}

export function getAutoSwitchModelsConfig(): Record<string, AutoSwitchModelConfig> {
  return CloudAccountSettingsStore.getSetting(
    'auto_switch_models',
    {},
    AutoSwitchModelsConfigSchema,
  );
}

export function setAutoSwitchModelsConfig(config: Record<string, AutoSwitchModelConfig>): void {
  CloudAccountSettingsStore.setSetting('auto_switch_models', config);
}

export async function forcePollCloudMonitor(): Promise<void> {
  const { CloudMonitorService } =
    await import('@/modules/cloud-account/services/CloudMonitorService');
  await CloudMonitorService.poll();
}

export async function startAuthFlow(oauthClientKey?: string): Promise<void> {
  if (isString(oauthClientKey) && !isEmpty(oauthClientKey.trim())) {
    setActiveOAuthClient(oauthClientKey);
  } else {
    hydrateActiveOAuthClientFromSettings();
  }
  const url = GoogleAPIService.getAuthUrl(oauthClientKey);

  logger.info(`Starting auth flow, opening URL: ${url}`);
  await shell.openExternal(url);
}

export function listOAuthClients(): OAuthClientDescriptor[] {
  hydrateActiveOAuthClientFromSettings();
  return GoogleAPIService.listOAuthClients();
}

export function getActiveOAuthClient(): string {
  hydrateActiveOAuthClientFromSettings();
  return GoogleAPIService.getActiveOAuthClientKey();
}

export function setActiveOAuthClient(clientKey: string): void {
  GoogleAPIService.setActiveOAuthClientKey(clientKey);
  CloudAccountSettingsStore.setSetting(
    ACTIVE_OAUTH_CLIENT_KEY_SETTING,
    GoogleAPIService.getActiveOAuthClientKey(),
  );
}

export async function exportCloudAccounts(stripTokens = false): Promise<string> {
  const accounts = await CloudAccountRepo.getAccounts();
  const exportData = {
    version: '1.0' as const,
    exportedAt: Math.floor(Date.now() / 1000),
    accounts: accounts.map((account) => ({
      provider: account.provider,
      email: account.email,
      name: account.name,
      avatar_url: account.avatar_url,
      token: stripTokens ? undefined : account.token,
      quota: account.quota,
      device_profile: account.device_profile,
      device_history: account.device_history,
      proxy_url: account.proxy_url ?? null,
      status: account.status,
      status_reason: account.status_reason,
    })),
  };

  CloudAccountExportSchema.parse(exportData);
  return JSON.stringify(exportData, null, 2);
}

export type ImportStrategy = 'merge' | 'overwrite' | 'skip-existing';

interface CloudAccountImportResult {
  imported: number;
  skipped: number;
  updated: number;
  errors: string[];
}

export async function importCloudAccounts(
  jsonContent: string,
  strategy: ImportStrategy = 'merge',
): Promise<CloudAccountImportResult> {
  const result: CloudAccountImportResult = { imported: 0, skipped: 0, updated: 0, errors: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    throw new Error('Invalid JSON format');
  }

  const validated = CloudAccountExportSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Invalid export file: ${validated.error.issues[0]?.message || 'schema mismatch'}`,
    );
  }

  const importEmails = new Set<string>();
  for (const importedAccount of validated.data.accounts) {
    const emailLower = importedAccount.email.toLowerCase();
    if (importEmails.has(emailLower)) {
      throw new Error(`Duplicate email found in import file: ${importedAccount.email}`);
    }
    importEmails.add(emailLower);
  }

  const existingAccounts = await CloudAccountRepo.getAccounts();
  const existingByEmail = new Map(existingAccounts.map((a) => [a.email.toLowerCase(), a]));

  for (const importedAccount of validated.data.accounts) {
    try {
      const existing = existingByEmail.get(importedAccount.email.toLowerCase());
      const now = Math.floor(Date.now() / 1000);

      if (existing) {
        if (strategy === 'skip-existing') {
          result.skipped++;
          continue;
        }

        const replacesStoredRefreshGrant = replacesRefreshGrant(
          existing.token,
          importedAccount.token,
        );
        const preservesBlockedAccountStatus =
          !replacesStoredRefreshGrant && existing.health?.oauth?.refresh_blocked === true;
        const shouldResetOAuthStatus =
          replacesStoredRefreshGrant &&
          existing.status === 'expired' &&
          isOAuthReauthReason(existing.status_reason ?? '');
        const recoveredHealth = existing.health?.validation
          ? { validation: existing.health.validation }
          : undefined;
        const updatedAccount: CloudAccount = {
          ...existing,
          provider: importedAccount.provider,
          name: importedAccount.name ?? existing.name,
          avatar_url: importedAccount.avatar_url ?? existing.avatar_url,
          token: importedAccount.token ?? existing.token,
          quota: importedAccount.quota ?? existing.quota,
          health: replacesStoredRefreshGrant ? recoveredHealth : existing.health,
          device_profile: importedAccount.device_profile ?? existing.device_profile,
          device_history: importedAccount.device_history ?? existing.device_history,
          proxy_url: importedAccount.proxy_url ?? existing.proxy_url,
          status: shouldResetOAuthStatus
            ? 'active'
            : preservesBlockedAccountStatus
              ? existing.status
              : (importedAccount.status ?? existing.status),
          status_reason: shouldResetOAuthStatus
            ? undefined
            : preservesBlockedAccountStatus
              ? existing.status_reason
              : (importedAccount.status_reason ?? existing.status_reason),
        };

        await CloudAccountRepo.addAccount(updatedAccount);
        if (replacesStoredRefreshGrant) {
          await CloudAccountRefreshService.clearFailureState(existing.id);
        }
        result.updated++;
      } else {
        if (!importedAccount.token) {
          result.errors.push(
            `Failed to import ${importedAccount.email}: export file does not include tokens`,
          );
          continue;
        }

        const newAccount: CloudAccount = {
          id: uuidv4(),
          provider: importedAccount.provider,
          email: importedAccount.email,
          name: importedAccount.name,
          avatar_url: importedAccount.avatar_url,
          token: importedAccount.token,
          quota: importedAccount.quota,
          device_profile: importedAccount.device_profile,
          device_history: importedAccount.device_history,
          proxy_url: importedAccount.proxy_url ?? undefined,
          created_at: now,
          last_used: now,
          status: importedAccount.status ?? 'active',
          status_reason: importedAccount.status_reason,
          is_active: false,
        };

        await CloudAccountRepo.addAccount(newAccount);
        result.imported++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to import ${importedAccount.email}: ${errorMessage}`);
    }
  }

  return result;
}

export function getMetricsPollInterval(): number {
  return CloudMonitorService.getPollIntervalMinutes();
}

export function setMetricsPollInterval(minutes: number): number {
  CloudMonitorService.setPollIntervalMinutes(minutes);
  return CloudMonitorService.getPollIntervalMinutes();
}

export function getMetricsSyncDelayConfig(): { minDelaySeconds: number; maxDelaySeconds: number } {
  return {
    minDelaySeconds: CloudMonitorService.getDelayMinSeconds(),
    maxDelaySeconds: CloudMonitorService.getDelayMaxSeconds(),
  };
}

export function setMetricsSyncDelayConfig(input: {
  minDelaySeconds: number;
  maxDelaySeconds: number;
}): { minDelaySeconds: number; maxDelaySeconds: number } {
  const min = Math.max(0, input.minDelaySeconds);
  const max = Math.max(min, input.maxDelaySeconds);
  CloudMonitorService.setDelayMinSeconds(min);
  CloudMonitorService.setDelayMaxSeconds(max);
  return {
    minDelaySeconds: min,
    maxDelaySeconds: max,
  };
}

export function getSyncingAccountId(): string | null {
  return CloudMonitorService.getSyncingAccountId();
}

export function getEmulationState() {
  return AccountEmulationService.getState();
}

export function setEmulationEnabled(enabled: boolean) {
  return AccountEmulationService.setEnabled(enabled);
}

export function setEmulationTickInterval(seconds: number) {
  return AccountEmulationService.setTickInterval(seconds);
}

export function generateEmulatedAccounts(
  count: number,
  preset?: EmulationPresetType,
  options?: GenerateEmulatedAccountsOptions,
) {
  return AccountEmulationService.generateAccounts(count, preset, options);
}

export function updateEmulatedAccountStrategy(
  accountId: string,
  strategy: AccountEmulationStrategyConfig,
) {
  return AccountEmulationService.updateAccountStrategy(accountId, strategy);
}

export function resetEmulatedQuotas() {
  AccountEmulationService.resetQuotas();
  return AccountEmulationService.getState();
}

export function clearEmulatedAccounts() {
  AccountEmulationService.clearAccounts();
  return AccountEmulationService.getState();
}

export function getFamilyGroups(): AccountFamilyGroup[] {
  return FamilyGroupStore.getFamilyGroups();
}

export function saveFamilyGroup(group: AccountFamilyGroup): AccountFamilyGroup {
  return FamilyGroupStore.saveFamilyGroup(group);
}

export function deleteFamilyGroup(groupId: string): void {
  FamilyGroupStore.deleteFamilyGroup(groupId);
}

export function linkAccountsToFamily(
  accountIds: string[],
  groupName?: string,
  groupId?: string,
  primaryAccountId?: string,
): AccountFamilyGroup {
  return FamilyGroupStore.linkAccounts(accountIds, groupName, groupId, primaryAccountId);
}

export function unlinkAccountFromFamily(accountId: string): void {
  FamilyGroupStore.unlinkAccount(accountId);
}

