import { z } from 'zod';
import type { CloudQuotaData } from '@/modules/cloud-account/types';

export type EmulationDrainStrategyType =
  | 'static'
  | 'linear'
  | 'bursty'
  | 'random_walk'
  | 'rate_limited'
  | 'auto_recover';

export const AccountEmulationStrategyConfigSchema = z.object({
  type: z.enum(['static', 'linear', 'bursty', 'random_walk', 'rate_limited', 'auto_recover']),
  drainStepPercent: z.number().default(3), // percentage to drain per tick
  tickIntervalSeconds: z.number().default(5), // interval in seconds
  targetPercentage: z.number().optional(), // for static mode
  rateLimitProbability: z.number().min(0).max(1).optional(), // for bursty/rate_limited modes
  recoveryDelaySeconds: z.number().optional(), // for auto_recover mode
});

export type AccountEmulationStrategyConfig = z.infer<typeof AccountEmulationStrategyConfigSchema>;

export interface EmulatedAccountProfile {
  id: string;
  is_emulated: true;
  provider: 'google' | 'anthropic';
  email: string;
  name: string;
  avatar_url?: string | null;
  tier: 'Free' | 'Pro' | 'Ultra';
  strategy: AccountEmulationStrategyConfig;
  status: 'active' | 'rate_limited' | 'expired' | 'paused';
  status_reason?: string;
  quota: CloudQuotaData;
  created_at: number;
  last_used: number;
  is_active_ide?: boolean;
}

export const EmulatedAccountProfileSchema = z.object({
  id: z.string(),
  is_emulated: z.literal(true),
  provider: z.enum(['google', 'anthropic']),
  email: z.string(),
  name: z.string(),
  avatar_url: z.string().nullable().optional(),
  tier: z.enum(['Free', 'Pro', 'Ultra']),
  strategy: AccountEmulationStrategyConfigSchema,
  status: z.enum(['active', 'rate_limited', 'expired', 'paused']),
  status_reason: z.string().optional(),
  quota: z.any(), // CloudQuotaData validated separately
  created_at: z.number(),
  last_used: z.number(),
  is_active_ide: z.boolean().optional(),
});

export type EmulationPresetType =
  | 'drain_demo'
  | 'auto_switch_test_bench'
  | 'bursty_workload'
  | 'rate_limited_test'
  | 'balanced_pool'
  | 'random_modern_mix';

export interface GenerateEmulatedAccountsOptions {
  randomizeQuota?: boolean;
  randomizeModels?: boolean;
  minModelsPerAccount?: number;
  maxModelsPerAccount?: number;
}

export interface EmulationState {
  enabled: boolean;
  tickIntervalSeconds: number;
  accounts: EmulatedAccountProfile[];
}

export const EmulationStateSchema = z.object({
  enabled: z.boolean().default(false),
  tickIntervalSeconds: z.number().default(5),
  accounts: z.array(EmulatedAccountProfileSchema).default([]),
});

export function formatTickInterval(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) {
    return `${mins}m`;
  }
  return `${mins}m ${secs}s`;
}
