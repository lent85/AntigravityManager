import type { CloudQuotaData, CloudQuotaGroup, CloudQuotaModelInfo } from '@/modules/cloud-account/types';

/**
 * Pure Domain Engine for Cloud Account Quota Management.
 * Enforces Business Invariant INV-2: Unified Group Quota Consistency.
 * No I/O, no database, no frameworks - 100% deterministic and testable.
 */

export interface GroupQuotaSnapshot {
  gemini5hPercent: number;
  claude5hPercent: number;
  geminiResetTime: string;
  claudeResetTime: string;
  geminiWeeklyFraction: number;
  claudeWeeklyFraction: number;
  weeklyResetTime: string;
}

export function isGeminiModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('gemini');
}

export function isClaudeModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('claude');
}

/**
 * Validates INV-2: All Gemini models must share the same 5h quota % and resetTime,
 * and all Claude models must share the same 5h quota % and resetTime.
 */
export function validateGroupQuotaConsistency(models: Record<string, CloudQuotaModelInfo>): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  let expectedGeminiPct: number | null = null;
  let expectedGeminiReset: string | null = null;
  let expectedClaudePct: number | null = null;
  let expectedClaudeReset: string | null = null;

  for (const [id, info] of Object.entries(models)) {
    if (isGeminiModel(id)) {
      if (expectedGeminiPct === null) {
        expectedGeminiPct = info.percentage;
        expectedGeminiReset = info.resetTime;
      } else {
        if (info.percentage !== expectedGeminiPct) {
          violations.push(`Gemini model ${id} percentage ${info.percentage} !== expected ${expectedGeminiPct}`);
        }
        if (info.resetTime !== expectedGeminiReset) {
          violations.push(`Gemini model ${id} resetTime ${info.resetTime} !== expected ${expectedGeminiReset}`);
        }
      }
    } else if (isClaudeModel(id)) {
      if (expectedClaudePct === null) {
        expectedClaudePct = info.percentage;
        expectedClaudeReset = info.resetTime;
      } else {
        if (info.percentage !== expectedClaudePct) {
          violations.push(`Claude model ${id} percentage ${info.percentage} !== expected ${expectedClaudePct}`);
        }
        if (info.resetTime !== expectedClaudeReset) {
          violations.push(`Claude model ${id} resetTime ${info.resetTime} !== expected ${expectedClaudeReset}`);
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Creates canonical Weekly Shared quota groups for Gemini and Claude.
 */
export function createWeeklyQuotaGroups(
  geminiWeeklyFraction: number,
  claudeWeeklyFraction: number,
  weeklyResetTime: string,
): CloudQuotaGroup[] {
  return [
    {
      display_name: 'Claude Weekly Shared',
      buckets: [
        {
          bucket_id: 'claude-weekly',
          window: 'weekly',
          remaining_fraction: Number(claudeWeeklyFraction.toFixed(4)),
          reset_time: weeklyResetTime,
          display_name: 'Claude Sonnet 4-6 Weekly',
        },
      ],
    },
    {
      display_name: 'Gemini Weekly Shared',
      buckets: [
        {
          bucket_id: 'gemini-weekly',
          window: 'weekly',
          remaining_fraction: Number(geminiWeeklyFraction.toFixed(4)),
          reset_time: weeklyResetTime,
          display_name: 'Gemini 3 Flash Weekly',
        },
      ],
    },
  ];
}

/**
 * Pure drain step calculation: reduces quota percentage across all models in parity.
 */
export function applyDrainStep(
  models: Record<string, CloudQuotaModelInfo>,
  quotaGroups: CloudQuotaGroup[] | undefined,
  drainPercent: number,
): {
  updatedModels: Record<string, CloudQuotaModelInfo>;
  updatedGroups: CloudQuotaGroup[];
  allDepleted: boolean;
} {
  const updatedModels: Record<string, CloudQuotaModelInfo> = {};
  let allDepleted = true;

  for (const [id, info] of Object.entries(models)) {
    const nextPct = Math.max(0, info.percentage - drainPercent);
    if (nextPct > 0) {
      allDepleted = false;
    }
    updatedModels[id] = {
      ...info,
      percentage: nextPct,
    };
  }

  const fractionDrain = drainPercent / 100;
  const updatedGroups: CloudQuotaGroup[] = (quotaGroups ?? []).map((group) => ({
    ...group,
    buckets: group.buckets.map((b) => ({
      ...b,
      remaining_fraction: Number(Math.max(0, b.remaining_fraction - fractionDrain).toFixed(4)),
    })),
  }));

  return {
    updatedModels,
    updatedGroups,
    allDepleted,
  };
}
