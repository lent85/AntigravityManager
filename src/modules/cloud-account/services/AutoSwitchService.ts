import { Notification } from 'electron';
import { CloudAccountRepo } from '@/modules/cloud-account/persistence/cloudHandler';
import { CloudAccountSettingsStore } from '@/modules/cloud-account/persistence/cloud-account-settings-store';
import { CloudAccount } from '@/modules/cloud-account/types';
import { markActiveAccount, switchCloudAccount } from '@/modules/cloud-account/ipc/handler';
import { logger } from '@/shared/logging/logger';
import type { AntigravityAppTarget } from '@/shared/platform/antigravityAppTarget';
import { selectWeeklyQuotaItems } from '@/modules/cloud-account/utils/quota-groups';

interface AccountSelectionScore {
  priorityScore: number | null;
  weeklyUrgencyScore: number;
  block5hUrgencyScore: number;
  fallbackScore: number;
  isSharedWithOtherTarget: boolean;
}

export class AutoSwitchService {
  /**
   * Checks if auto switch is enabled for a specific target or globally.
   */
  static isAutoSwitchEnabledForTarget(target?: AntigravityAppTarget | undefined): boolean {
    return CloudAccountSettingsStore.getAutoSwitchEnabledForTarget(target);
  }

  /**
   * Finds the best cloud account to switch to.
   * Criteria:
   * 1. Not the current account (unless it's the only one).
   * 2. Status is 'active' and not depleted.
   * 3. Target isolation: Prefer accounts not active in another target.
   * 4. Smart Urgency: Prioritize accounts nearing weekly or 5h reset with plenty of quota.
   * 5. Fallback to priority models and overall quota percentage.
   */
  static async findBestAccount(
    currentAccountId: string,
    target?: AntigravityAppTarget,
    now: number = Date.now(),
  ): Promise<CloudAccount | null> {
    const accounts = await CloudAccountRepo.getAccounts();
    const config =
      CloudAccountSettingsStore.getSetting<Record<string, { enabled: boolean; priority: boolean }>>(
        'auto_switch_models',
        {},
      ) || {};

    // 1. Filter viable candidate accounts
    const candidates = accounts.filter((acc) => {
      if (acc.id === currentAccountId) return false;
      if (acc.status !== 'active') return false; // Rate limited or expired accounts are skipped
      if (!acc.quota) return false; // No quota data means risky

      return !this.isAccountDepleted(acc);
    });

    if (candidates.length === 0) return null;

    // 2. Target Isolation: Find accounts currently in use by other targets
    const otherActiveAccountIds = new Set<string>();
    if (target) {
      for (const t of ['classic', 'ide', 'agy'] as const) {
        if (t !== target) {
          const activeId = CloudAccountSettingsStore.getActiveAccountIdForTarget(t);
          if (activeId) {
            otherActiveAccountIds.add(activeId);
          }
        }
      }
    }

    // Split candidates into non-overlapping and overlapping
    const nonOverlappingCandidates = candidates.filter(
      (acc) => !otherActiveAccountIds.has(acc.id),
    );
    // Use non-overlapping candidates first; fallback to all candidates only if none available
    const candidatePool =
      nonOverlappingCandidates.length > 0 ? nonOverlappingCandidates : candidates;

    // 3. Sort candidates using Smart Quota Urgency Score
    candidatePool.sort((a, b) => {
      const isAShared = otherActiveAccountIds.has(a.id);
      const isBShared = otherActiveAccountIds.has(b.id);
      if (isAShared !== isBShared) {
        return isAShared ? 1 : -1;
      }

      const scoreA = this.calculateAccountScore(a, config, isAShared, now);
      const scoreB = this.calculateAccountScore(b, config, isBShared, now);

      // Compare Weekly and 5h Block Urgency (burning quota before reset)
      const urgencyA = scoreA.weeklyUrgencyScore + scoreA.block5hUrgencyScore;
      const urgencyB = scoreB.weeklyUrgencyScore + scoreB.block5hUrgencyScore;

      if (Math.abs(urgencyA - urgencyB) >= 1) {
        return urgencyB - urgencyA;
      }

      // Priority models comparison
      if (scoreA.priorityScore !== null || scoreB.priorityScore !== null) {
        if (scoreA.priorityScore === null) return 1;
        if (scoreB.priorityScore === null) return -1;
        if (scoreA.priorityScore !== scoreB.priorityScore) {
          return scoreB.priorityScore - scoreA.priorityScore;
        }
      }

      return scoreB.fallbackScore - scoreA.fallbackScore;
    });

    return candidatePool[0];
  }

  private static getModelConfig(
    config: Record<string, { enabled: boolean; priority: boolean }>,
    modelId: string,
  ) {
    const normalizedModelId = modelId.replace(/^models\//i, '');
    return config[modelId] ?? config[normalizedModelId];
  }

  private static calculateAccountScore(
    account: CloudAccount,
    config: Record<string, { enabled: boolean; priority: boolean }>,
    isSharedWithOtherTarget: boolean,
    now: number,
  ): AccountSelectionScore {
    if (!account.quota?.models) {
      return {
        priorityScore: null,
        weeklyUrgencyScore: 0,
        block5hUrgencyScore: 0,
        fallbackScore: 0,
        isSharedWithOtherTarget,
      };
    }

    const entries = Object.entries(account.quota.models);

    // 1. Priority models score
    const priorityEntries = entries.filter(([modelId]) => {
      const modelConfig = this.getModelConfig(config, modelId);
      return modelConfig?.enabled && modelConfig?.priority;
    });
    const priorityScore =
      priorityEntries.length > 0
        ? priorityEntries.reduce((acc, [, model]) => acc + model.percentage, 0) /
          priorityEntries.length
        : null;

    // 2. Fallback all-enabled models score
    const enabledEntries = entries.filter(([modelId]) => {
      const modelConfig = this.getModelConfig(config, modelId);
      return modelConfig ? modelConfig.enabled : true;
    });
    const fallbackScore =
      enabledEntries.length > 0
        ? enabledEntries.reduce((acc, [, model]) => acc + model.percentage, 0) /
          enabledEntries.length
        : 0;

    // 3. Weekly Quota Urgency Score: prioritize accounts nearing reset with plenty of quota
    let weeklyUrgencyScore = 0;
    const weeklyItems = selectWeeklyQuotaItems(account.quota.quota_groups);
    for (const item of weeklyItems) {
      if (!item.resetTime) continue;
      const resetTimestamp = Date.parse(item.resetTime);
      if (Number.isNaN(resetTimestamp) || resetTimestamp <= now) continue;

      const hoursUntilReset = (resetTimestamp - now) / (1000 * 60 * 60);
      // If resetting within 72 hours and still has substantial quota (>= 20%)
      if (hoursUntilReset <= 72 && item.percentage >= 20) {
        // Shorter time + higher percentage yields higher score
        const score = (item.percentage / Math.max(1, hoursUntilReset)) * 5;
        if (score > weeklyUrgencyScore) {
          weeklyUrgencyScore = score;
        }
      }
    }

    // 4. 5h Block Quota Urgency Score: prioritize accounts nearing block reset with high quota
    let block5hUrgencyScore = 0;
    for (const [, model] of enabledEntries) {
      if (!model.resetTime) continue;
      const resetTimestamp = Date.parse(model.resetTime);
      if (Number.isNaN(resetTimestamp) || resetTimestamp <= now) continue;

      const minutesUntilReset = (resetTimestamp - now) / (1000 * 60);
      // If resetting within 90 minutes and has remaining quota >= 20%
      if (minutesUntilReset <= 90 && model.percentage >= 20) {
        const score = (model.percentage / Math.max(5, minutesUntilReset)) * 5;
        if (score > block5hUrgencyScore) {
          block5hUrgencyScore = score;
        }
      }
    }

    return {
      priorityScore,
      weeklyUrgencyScore,
      block5hUrgencyScore,
      fallbackScore,
      isSharedWithOtherTarget,
    };
  }

  /**
   * Triggered by Monitor Service or UI.
   * Checks if we need to switch from the current account.
   */
  static async checkAndSwitchIfNeeded(
    appTarget?: AntigravityAppTarget | undefined,
    now: number = Date.now(),
  ): Promise<boolean> {
    const enabled = this.isAutoSwitchEnabledForTarget(appTarget);
    if (!enabled) return false;

    // Get current active account for the target
    const accounts = await CloudAccountRepo.getAccounts();
    const activeAccountId = CloudAccountSettingsStore.getActiveAccountIdForTarget(appTarget);
    const targetAccount = activeAccountId
      ? accounts.find((account) => account.id === activeAccountId)
      : undefined;

    if (activeAccountId && !targetAccount) {
      logger.warn(
        `AutoSwitch: Active account ${activeAccountId} for target ${appTarget ?? 'default'} no longer exists; falling back to the global active account.`,
      );
    }

    const currentAccount = targetAccount ?? accounts.find((account) => account.is_active);

    // If no active account, nothing to check
    if (!currentAccount) return false;

    // Check if current is depleted
    const isDepleted = this.isAccountDepleted(currentAccount);

    if (isDepleted || currentAccount.status === 'rate_limited') {
      logger.info(
        `AutoSwitch: Current account ${currentAccount.email} for target ${appTarget ?? 'default'} is depleted or rate limited.`,
      );

      const nextAccount = await this.findBestAccount(currentAccount.id, appTarget, now);
      if (nextAccount) {
        const isNoRestart = CloudAccountSettingsStore.isNoRestartEnabled();
        logger.info(
          `AutoSwitch: Switching target ${appTarget ?? 'default'} to ${nextAccount.email} (no-restart: ${isNoRestart})...`,
        );

        const targetLabel =
          appTarget === 'agy' ? 'CLI' : appTarget === 'ide' ? 'IDE' : 'App (Classic)';

        if (isNoRestart && appTarget !== 'agy') {
          // Perform live sync without restarting GUI process
          await markActiveAccount(nextAccount.id, appTarget);

          try {
            new Notification({
              title: `Antigravity Manager: Auto-Switch (${targetLabel})`,
              body: `Switched to ${nextAccount.email} (Live sync, no restart). Token updated in credential store.`,
            }).show();
          } catch (err) {
            logger.error('Failed to show auto-switch desktop notification', err);
          }
        } else {
          // Perform standard switch (CLI is always seamless; GUI apps restart)
          await switchCloudAccount(nextAccount.id, appTarget);

          try {
            new Notification({
              title: `Antigravity Manager: Auto-Switch (${targetLabel})`,
              body:
                appTarget === 'agy'
                  ? `Switched CLI account to ${nextAccount.email} due to quota limit.`
                  : `Switched account to ${nextAccount.email} due to quota limit. Reopen IDE and type "continue" if needed!`,
            }).show();
          } catch (err) {
            logger.error('Failed to show auto-switch desktop notification', err);
          }
        }

        return true;
      } else {
        logger.warn(
          `AutoSwitch: No healthy accounts available to switch to for target ${appTarget ?? 'default'}.`,
        );
      }
    }

    return false;
  }

  static isAccountDepleted(account: CloudAccount): boolean {
    if (!account.quota) return false;
    const THRESHOLD = 5;

    const config =
      CloudAccountSettingsStore.getSetting<Record<string, { enabled: boolean; priority: boolean }>>(
        'auto_switch_models',
        {},
      ) || {};

    const enabledModels = Object.entries(account.quota.models).filter(([modelId]) => {
      const modelConfig = this.getModelConfig(config, modelId);
      return modelConfig ? modelConfig.enabled : true;
    });

    if (enabledModels.length === 0) {
      return false; // No enabled models, so not depleted
    }

    const maxPercentageByQuotaGroup = new Map<string, number>();
    for (const [modelId, model] of enabledModels) {
      const normalizedModelId = modelId.replace(/^models\//i, '').toLowerCase();
      let quotaGroupId = normalizedModelId;

      if (normalizedModelId.includes('image')) {
        quotaGroupId = normalizedModelId.includes('flash')
          ? 'gemini-3.1-flash-image'
          : 'gemini-3-pro-image';
      } else if (normalizedModelId.includes('flash')) {
        quotaGroupId = 'gemini-3-flash';
      } else if (normalizedModelId.includes('pro')) {
        quotaGroupId = 'gemini-3-pro-high';
      } else if (
        normalizedModelId.includes('claude') ||
        normalizedModelId.includes('opus') ||
        normalizedModelId.includes('sonnet') ||
        normalizedModelId.includes('haiku')
      ) {
        quotaGroupId = 'claude';
      }

      const currentMaximum = maxPercentageByQuotaGroup.get(quotaGroupId) ?? -1;
      if (model.percentage > currentMaximum) {
        maxPercentageByQuotaGroup.set(quotaGroupId, model.percentage);
      }
    }

    const anyQuotaGroupDepleted = [...maxPercentageByQuotaGroup.values()].some(
      (percentage) => percentage < THRESHOLD,
    );
    if (anyQuotaGroupDepleted) {
      return true;
    }

    // Check quota groups
    const depletedGroups = (account.quota.quota_groups || []).filter((g) => {
      const lowestBucket = g.buckets.reduce(
        (min, b) => Math.min(min, b.remaining_fraction * 100),
        100,
      );
      return lowestBucket < THRESHOLD;
    });

    if (depletedGroups.length > 0) {
      const anyAffected = depletedGroups.some((group) => {
        const groupText = [group.display_name, group.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return enabledModels.some(([modelId]) => {
          const normalizedModelId = modelId.replace(/^models\//i, '').toLowerCase();
          const modelPart = normalizedModelId.split('-')[0]; // 'claude' or 'gemini' etc.
          return groupText.includes(modelPart) || groupText.includes(normalizedModelId);
        });
      });
      if (anyAffected) {
        return true;
      }
    }

    return false;
  }
}
