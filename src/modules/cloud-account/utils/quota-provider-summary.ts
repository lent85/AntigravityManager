import { flatMap, sumBy } from 'lodash-es';
import type { CloudAccount } from '@/modules/cloud-account/types';
import {
  getQuotaStatus,
  roundQuotaPercentage,
  type QuotaStatus,
} from '@/modules/cloud-account/utils/quota-display';
import {
  selectWeeklyQuotaItems,
  type WeeklyQuotaItem,
} from '@/modules/cloud-account/utils/quota-groups';

export interface ProviderGlobalQuota {
  quota5h: number | null;
  status5h: QuotaStatus;
  quotaWeekly: number | null;
  statusWeekly: QuotaStatus;
}

export interface ProvidersGlobalQuotaSummary {
  gemini: ProviderGlobalQuota;
  claude: ProviderGlobalQuota;
}

const GEMINI_LEGACY_MODEL_PATTERN = /gemini-[12](\.|$|-)/i;

export function isGeminiModel(modelName: string): boolean {
  const normalized = modelName.replace(/^models\//i, '').trim().toLowerCase();
  return normalized.includes('gemini') && !GEMINI_LEGACY_MODEL_PATTERN.test(normalized);
}

export function isClaudeModel(modelName: string): boolean {
  const normalized = modelName.replace(/^models\//i, '').trim().toLowerCase();
  return normalized.includes('claude');
}

export function isGeminiWeeklyItem(item: WeeklyQuotaItem): boolean {
  const text = `${item.groupName} ${item.groupDescription ?? ''} ${item.bucketLabel} ${item.bucket.bucket_id} ${item.bucket.display_name ?? ''}`.toLowerCase();
  return text.includes('gemini');
}

export function isClaudeWeeklyItem(item: WeeklyQuotaItem): boolean {
  const text = `${item.groupName} ${item.groupDescription ?? ''} ${item.bucketLabel} ${item.bucket.bucket_id} ${item.bucket.display_name ?? ''}`.toLowerCase();
  return text.includes('claude');
}

function calculateAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return roundQuotaPercentage(sumBy(values, (v) => v) / values.length);
}

export function calculateProvidersGlobalQuota(
  accounts: CloudAccount[],
  modelVisibility: Record<string, boolean> = {},
): ProvidersGlobalQuotaSummary {
  if (accounts.length === 0) {
    return {
      gemini: { quota5h: null, status5h: 'low', quotaWeekly: null, statusWeekly: 'low' },
      claude: { quota5h: null, status5h: 'low', quotaWeekly: null, statusWeekly: 'low' },
    };
  }

  // Account-level 5h quotas
  const geminiAccount5hList: number[] = [];
  const claudeAccount5hList: number[] = [];

  // Account-level Weekly quotas
  const geminiAccountWeeklyList: number[] = [];
  const claudeAccountWeeklyList: number[] = [];

  for (const account of accounts) {
    // 5h Quota calculation for Gemini & Claude
    if (account.quota?.models) {
      const geminiModelPcts: number[] = [];
      const claudeModelPcts: number[] = [];

      for (const [modelName, info] of Object.entries(account.quota.models)) {
        if (modelVisibility[modelName] === false) {
          continue;
        }

        if (isGeminiModel(modelName)) {
          geminiModelPcts.push(info.percentage);
        } else if (isClaudeModel(modelName)) {
          claudeModelPcts.push(info.percentage);
        }
      }

      if (geminiModelPcts.length > 0) {
        geminiAccount5hList.push(sumBy(geminiModelPcts, (p) => p) / geminiModelPcts.length);
      }
      if (claudeModelPcts.length > 0) {
        claudeAccount5hList.push(sumBy(claudeModelPcts, (p) => p) / claudeModelPcts.length);
      }
    }

    // Weekly Quota calculation for Gemini & Claude
    if (account.quota?.quota_groups) {
      const weeklyItems = selectWeeklyQuotaItems(account.quota.quota_groups);
      const geminiWeeklyPcts: number[] = [];
      const claudeWeeklyPcts: number[] = [];

      for (const item of weeklyItems) {
        if (isGeminiWeeklyItem(item)) {
          geminiWeeklyPcts.push(item.percentage);
        } else if (isClaudeWeeklyItem(item)) {
          claudeWeeklyPcts.push(item.percentage);
        }
      }

      if (geminiWeeklyPcts.length > 0) {
        geminiAccountWeeklyList.push(sumBy(geminiWeeklyPcts, (p) => p) / geminiWeeklyPcts.length);
      }
      if (claudeWeeklyPcts.length > 0) {
        claudeAccountWeeklyList.push(sumBy(claudeWeeklyPcts, (p) => p) / claudeWeeklyPcts.length);
      }
    }
  }

  const gemini5h = calculateAverage(geminiAccount5hList);
  const geminiWeekly = calculateAverage(geminiAccountWeeklyList);
  const claude5h = calculateAverage(claudeAccount5hList);
  const claudeWeekly = calculateAverage(claudeAccountWeeklyList);

  return {
    gemini: {
      quota5h: gemini5h,
      status5h: gemini5h !== null ? getQuotaStatus(gemini5h) : 'low',
      quotaWeekly: geminiWeekly,
      statusWeekly: geminiWeekly !== null ? getQuotaStatus(geminiWeekly) : 'low',
    },
    claude: {
      quota5h: claude5h,
      status5h: claude5h !== null ? getQuotaStatus(claude5h) : 'low',
      quotaWeekly: claudeWeekly,
      statusWeekly: claudeWeekly !== null ? getQuotaStatus(claudeWeekly) : 'low',
    },
  };
}
