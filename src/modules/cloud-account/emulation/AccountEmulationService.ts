import { logger } from '@/shared/logging/logger';
import { CloudAccountSettingsStore } from '@/modules/cloud-account/persistence/cloud-account-settings-store';
import type { CloudAccount, CloudQuotaData } from '@/modules/cloud-account/types';
import {
  type AccountEmulationStrategyConfig,
  type EmulatedAccountProfile,
  type EmulationPresetType,
  type EmulationState,
  type GenerateEmulatedAccountsOptions,
  EmulationStateSchema,
} from './types';
import {
  createWeeklyQuotaGroups,
  applyDrainStep,
} from '@/modules/cloud-account/domain/quota-group-engine';
import { randomUUID } from 'node:crypto';

export interface SimulationModelDefinition {
  id: string;
  displayName: string;
  provider: 'google' | 'anthropic' | 'other';
  supportsThinking?: boolean;
  supportsImages?: boolean;
}

export const SIMULATION_MODERN_MODELS: readonly SimulationModelDefinition[] = [
  // Gemini modern models (Google Antigravity current catalog)
  { id: 'gemini-3.8-flash-tiered', displayName: 'Gemini 3.8 Flash Tiered', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.8-flash-high', displayName: 'Gemini 3.8 Flash High', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.8-flash-medium', displayName: 'Gemini 3.8 Flash Medium', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.8-flash-low', displayName: 'Gemini 3.8 Flash Low', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.7-flash-tiered', displayName: 'Gemini 3.7 Flash Tiered', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.7-flash-high', displayName: 'Gemini 3.7 Flash High', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.7-flash-medium', displayName: 'Gemini 3.7 Flash Medium', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.7-flash-low', displayName: 'Gemini 3.7 Flash Low', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.6-flash-tiered', displayName: 'Gemini 3.6 Flash Tiered', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.6-flash-high', displayName: 'Gemini 3.6 Flash High', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.6-flash-medium', displayName: 'Gemini 3.6 Flash Medium', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.6-flash-low', displayName: 'Gemini 3.6 Flash Low', provider: 'google', supportsThinking: true },
  { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', provider: 'google', supportsImages: true },
  { id: 'gemini-3.1-pro', displayName: 'Gemini 3.1 Pro', provider: 'google', supportsThinking: true, supportsImages: true },
  { id: 'gemini-flash-lite', displayName: 'Gemini Flash Lite', provider: 'google', supportsImages: true },
  { id: 'gemini-flash-image', displayName: 'Gemini Flash Image', provider: 'google', supportsImages: true },

  // Claude modern models (provided via Google Antigravity)
  { id: 'claude-sonnet-4-6', displayName: 'Claude 4.6 Sonnet', provider: 'anthropic', supportsThinking: true },
  { id: 'claude-opus-4-6', displayName: 'Claude Opus 4 6', provider: 'anthropic', supportsThinking: true },
];

const EMULATION_SETTING_KEY = 'cloud_account_emulation_state';

const MOCK_NAMES = [
  'Alex Chen',
  'Sarah Miller',
  'David Kim',
  'Elena Rostova',
  'Marcus Vance',
  'Yuki Tanaka',
  'Priya Patel',
  'Lucas Silva',
  'Emma Watson',
  'Liam Johnson',
];

export class AccountEmulationService {
  private static tickerTimer: ReturnType<typeof setInterval> | null = null;

  static getState(): EmulationState {
    const raw = CloudAccountSettingsStore.getSetting<unknown>(EMULATION_SETTING_KEY, {
      enabled: false,
      tickIntervalSeconds: 5,
      accounts: [],
    });

    const parsed = EmulationStateSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('Failed to parse emulation state, resetting to default', parsed.error);
      return {
        enabled: false,
        tickIntervalSeconds: 5,
        accounts: [],
      };
    }
    const state = parsed.data as EmulationState;
    let modified = false;
    for (const acc of state.accounts) {
      if (acc.email.endsWith('@sim.mock')) {
        acc.email = acc.email.replace(/@sim\.mock$/, '@gmail.com');
        modified = true;
      }
      if (acc.status_reason && (acc.status_reason.includes('Emulated') || acc.status_reason.includes('Simulated'))) {
        acc.status_reason = acc.status_reason.replace(/\s*\((?:Emulated|Simulated)[^)]*\)/g, '').trim();
        modified = true;
      }

      // Automatically migrate emulated accounts to include the full modern Google catalog and sync group quotas
      if (acc.is_emulated) {
        const existingKeys = Object.keys(acc.quota?.models || {});
        const isMissingNewModels = SIMULATION_MODERN_MODELS.some((m) => !acc.quota?.models?.[m.id]);
        const hasLegacyModels = existingKeys.some((k) => !SIMULATION_MODERN_MODELS.some((m) => m.id === k));

        if (isMissingNewModels || hasLegacyModels) {
          let geminiPct = 85;
          let geminiResetTime = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
          for (const key of existingKeys) {
            if (key.includes('gemini') && acc.quota.models[key]) {
              geminiPct = acc.quota.models[key].percentage;
              if (acc.quota.models[key].resetTime) {
                geminiResetTime = acc.quota.models[key].resetTime;
              }
              break;
            }
          }

          let claudePct = 80;
          let claudeResetTime = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
          for (const key of existingKeys) {
            if (key.includes('claude') && acc.quota.models[key]) {
              claudePct = acc.quota.models[key].percentage;
              if (acc.quota.models[key].resetTime) {
                claudeResetTime = acc.quota.models[key].resetTime;
              }
              break;
            }
          }

          const upgradedModels: CloudQuotaData['models'] = {};
          for (const mDef of SIMULATION_MODERN_MODELS) {
            const isClaude = mDef.provider === 'anthropic' || mDef.id.includes('claude');
            upgradedModels[mDef.id] = {
              percentage: isClaude ? claudePct : geminiPct,
              resetTime: isClaude ? claudeResetTime : geminiResetTime,
              display_name: mDef.displayName,
              ...(mDef.supportsImages ? { supports_images: true } : {}),
              ...(mDef.supportsThinking ? { supports_thinking: true } : {}),
            };
          }
          acc.quota.models = upgradedModels;
          modified = true;
        }

        const hasWeeklyClaude =
          Array.isArray(acc.quota?.quota_groups) &&
          acc.quota.quota_groups.some((g) => g.display_name === 'Claude Weekly Shared');
        const hasWeeklyGemini =
          Array.isArray(acc.quota?.quota_groups) &&
          acc.quota.quota_groups.some((g) => g.display_name === 'Gemini Weekly Shared');

        if (!hasWeeklyClaude || !hasWeeklyGemini) {
          let geminiPct = 85;
          let claudePct = 80;
          for (const key of Object.keys(acc.quota?.models || {})) {
            if (key.includes('gemini') && acc.quota.models[key]) {
              geminiPct = acc.quota.models[key].percentage;
              break;
            }
          }
          for (const key of Object.keys(acc.quota?.models || {})) {
            if (key.includes('claude') && acc.quota.models[key]) {
              claudePct = acc.quota.models[key].percentage;
              break;
            }
          }
          const weeklyResetTimeStr = new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString();
          acc.quota.quota_groups = [
            {
              display_name: 'Claude Weekly Shared',
              buckets: [
                {
                  bucket_id: 'claude-weekly',
                  window: 'weekly',
                  remaining_fraction: Number((claudePct / 100).toFixed(2)),
                  reset_time: weeklyResetTimeStr,
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
                  remaining_fraction: Number((geminiPct / 100).toFixed(2)),
                  reset_time: weeklyResetTimeStr,
                  display_name: 'Gemini 3 Flash Weekly',
                },
              ],
            },
          ];
          modified = true;
        }
      }
    }
    if (modified) {
      this.saveState(state);
    }
    return state;
  }

  static saveState(state: EmulationState): void {
    CloudAccountSettingsStore.setSetting(EMULATION_SETTING_KEY, state);
  }

  static isEnabled(): boolean {
    return this.getState().enabled;
  }

  static setEnabled(enabled: boolean): EmulationState {
    const state = this.getState();
    state.enabled = enabled;
    this.saveState(state);

    if (enabled) {
      this.ensureTickerRunning();
    } else {
      this.stopTicker();
    }

    return state;
  }

  static setTickInterval(seconds: number): EmulationState {
    const state = this.getState();
    state.tickIntervalSeconds = Math.max(5, Math.min(3600, seconds));
    this.saveState(state);

    if (state.enabled) {
      this.stopTicker();
      this.ensureTickerRunning();
    }

    return state;
  }

  static isEmulated(accountId: string): boolean {
    return accountId.startsWith('emulated-');
  }

  static getEmulatedAccounts(): EmulatedAccountProfile[] {
    return this.getState().accounts;
  }

  static getCloudAccounts(): CloudAccount[] {
    const state = this.getState();
    if (!state.enabled) {
      return [];
    }
    return state.accounts.map((acc) => this.toCloudAccount(acc));
  }

  static toCloudAccount(profile: EmulatedAccountProfile): CloudAccount {
    return {
      id: profile.id,
      provider: profile.provider,
      email: profile.email,
      name: profile.name,
      avatar_url: profile.avatar_url,
      token: {
        access_token: `ya29.a0AfH6SMA${profile.id.replace(/[^a-zA-Z0-9]/g, '')}`,
        refresh_token: `1//0g${profile.id.replace(/[^a-zA-Z0-9]/g, '')}`,
        expires_in: 3600,
        expiry_timestamp: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        email: profile.email,
      },
      quota: profile.quota,
      created_at: profile.created_at,
      last_used: profile.last_used,
      status: profile.status,
      status_reason: profile.status_reason,
      is_active: !!profile.is_active_ide,
      is_active_ide: !!profile.is_active_ide,
      is_active_classic: false,
      is_active_agy: false,
      is_emulated: true,
      emulation_strategy: profile.strategy,
    };
  }

  static generateAccounts(
    count: number,
    preset: EmulationPresetType = 'balanced_pool',
    options?: GenerateEmulatedAccountsOptions,
  ): EmulatedAccountProfile[] {
    const state = this.getState();
    const created: EmulatedAccountProfile[] = [];
    const timestamp = Date.now();
    const shouldRandomizeQuota =
      options?.randomizeQuota === true ||
      options?.randomizeModels === true ||
      preset === 'random_modern_mix';

    for (let i = 0; i < count; i++) {
      const idx = (state.accounts.length + i) % MOCK_NAMES.length;
      const baseName = MOCK_NAMES[idx] || `Tester ${state.accounts.length + i + 1}`;
      const uniqueSuffix = randomUUID().slice(0, 4);
      const email = `${baseName.toLowerCase().replace(/\s+/g, '.')}.${uniqueSuffix}@gmail.com`;
      const id = `emulated-${randomUUID()}`;
      const provider: 'google' | 'anthropic' = 'google';

      let tier: 'Free' | 'Pro' | 'Ultra' = 'Pro';
      let status: 'active' | 'rate_limited' | 'expired' = 'active';
      let status_reason: string | undefined;
      let strategy: AccountEmulationStrategyConfig = {
        type: 'linear',
        drainStepPercent: 3,
        tickIntervalSeconds: state.tickIntervalSeconds,
      };

      let gemini5hPercent = 85;
      let geminiWeeklyFraction = 0.85;
      let claude5hPercent = 80;
      let claudeWeeklyFraction = 0.8;

      const ratio = Math.max(0.1, 1 - (i * 0.2) % 0.85);

      if (preset === 'drain_demo') {
        strategy = {
          type: 'linear',
          drainStepPercent: 4,
          tickIntervalSeconds: state.tickIntervalSeconds,
        };
        gemini5hPercent = 95;
        geminiWeeklyFraction = 0.95;
        claude5hPercent = 90;
        claudeWeeklyFraction = 0.9;
      } else if (preset === 'auto_switch_test_bench') {
        if (i === 0) {
          // Account 1: Low quota (< 5%) to trigger auto-switch
          gemini5hPercent = Math.floor(Math.random() * 3) + 2; // 2-4%
          geminiWeeklyFraction = Number((gemini5hPercent / 100).toFixed(2));
          claude5hPercent = Math.floor(Math.random() * 3) + 2; // 2-4%
          claudeWeeklyFraction = Number((claude5hPercent / 100).toFixed(2));
          strategy = { type: 'linear', drainStepPercent: 1, tickIntervalSeconds: state.tickIntervalSeconds };
        } else if (i === 1) {
          // Account 2: Rate limited
          status = 'rate_limited';
          status_reason = 'RESOURCE_EXHAUSTED';
          strategy = { type: 'rate_limited', drainStepPercent: 0, tickIntervalSeconds: state.tickIntervalSeconds };
          gemini5hPercent = 0;
          geminiWeeklyFraction = 0;
          claude5hPercent = 0;
          claudeWeeklyFraction = 0;
        } else {
          // Healthy backup accounts
          tier = i % 2 === 0 ? 'Ultra' : 'Pro';
          gemini5hPercent = Math.floor(Math.random() * 11) + 85; // 85-95%
          geminiWeeklyFraction = Number((gemini5hPercent / 100).toFixed(2));
          claude5hPercent = Math.floor(Math.random() * 11) + 80; // 80-90%
          claudeWeeklyFraction = Number((claude5hPercent / 100).toFixed(2));
          strategy = { type: 'linear', drainStepPercent: 2, tickIntervalSeconds: state.tickIntervalSeconds };
        }
      } else if (preset === 'bursty_workload') {
        strategy = {
          type: 'bursty',
          drainStepPercent: 12,
          tickIntervalSeconds: state.tickIntervalSeconds,
          rateLimitProbability: 0.25,
        };
        gemini5hPercent = Math.floor(Math.random() * 35) + 50; // 50-84%
        geminiWeeklyFraction = Number((gemini5hPercent / 100).toFixed(2));
        claude5hPercent = Math.floor(Math.random() * 35) + 45; // 45-79%
        claudeWeeklyFraction = Number((claude5hPercent / 100).toFixed(2));
      } else if (preset === 'rate_limited_test') {
        status = 'rate_limited';
        status_reason = 'RESOURCE_EXHAUSTED (HTTP 429)';
        strategy = { type: 'rate_limited', drainStepPercent: 0, tickIntervalSeconds: state.tickIntervalSeconds };
        gemini5hPercent = 0;
        geminiWeeklyFraction = 0;
        claude5hPercent = 0;
        claudeWeeklyFraction = 0;
      } else if (preset === 'random_modern_mix' || shouldRandomizeQuota) {
        const tiers: Array<'Free' | 'Pro' | 'Ultra'> = ['Free', 'Pro', 'Ultra'];
        tier = tiers[i % tiers.length] || 'Pro';
        strategy = {
          type: i % 2 === 0 ? 'linear' : 'bursty',
          drainStepPercent: Math.floor(Math.random() * 3) + 2,
          tickIntervalSeconds: state.tickIntervalSeconds,
          rateLimitProbability: 0.2,
        };
        gemini5hPercent = Math.floor(Math.random() * 85) + 15; // 15-99%
        geminiWeeklyFraction = Number((Math.max(0.1, (Math.floor(Math.random() * 85) + 15) / 100)).toFixed(2));
        claude5hPercent = Math.floor(Math.random() * 85) + 15; // 15-99%
        claudeWeeklyFraction = Number((Math.max(0.1, (Math.floor(Math.random() * 85) + 15) / 100)).toFixed(2));
      } else {
        // balanced_pool
        const tiers: Array<'Free' | 'Pro' | 'Ultra'> = ['Free', 'Pro', 'Ultra'];
        tier = tiers[i % tiers.length] || 'Pro';
        gemini5hPercent = Math.round(ratio * 100);
        geminiWeeklyFraction = Number(ratio.toFixed(2));
        claude5hPercent = Math.round(ratio * 90);
        claudeWeeklyFraction = Number(ratio.toFixed(2));
        strategy = { type: 'linear', drainStepPercent: 2, tickIntervalSeconds: state.tickIntervalSeconds };
      }

      const geminiResetTimeStr = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
      const claudeResetTimeStr = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
      const weeklyResetTimeStr = new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString();

      let modelDefs = [...SIMULATION_MODERN_MODELS];
      if (options?.minModelsPerAccount !== undefined || options?.maxModelsPerAccount !== undefined) {
        const minModels = Math.max(1, Math.min(options?.minModelsPerAccount ?? modelDefs.length, modelDefs.length));
        const maxModels = Math.max(minModels, Math.min(options?.maxModelsPerAccount ?? modelDefs.length, modelDefs.length));
        const targetModelCount = Math.floor(Math.random() * (maxModels - minModels + 1)) + minModels;
        modelDefs = modelDefs.slice(0, targetModelCount);
      }

      const quotaModels: CloudQuotaData['models'] = {};
      let hasClaude = false;
      let hasGemini = false;

      for (const mDef of modelDefs) {
        const isClaude = mDef.provider === 'anthropic' || mDef.id.toLowerCase().includes('claude');
        if (isClaude) {
          hasClaude = true;
          quotaModels[mDef.id] = {
            percentage: claude5hPercent,
            resetTime: claudeResetTimeStr,
            display_name: mDef.displayName,
            ...(mDef.supportsImages ? { supports_images: true } : {}),
            ...(mDef.supportsThinking ? { supports_thinking: true } : {}),
          };
        } else {
          hasGemini = true;
          quotaModels[mDef.id] = {
            percentage: gemini5hPercent,
            resetTime: geminiResetTimeStr,
            display_name: mDef.displayName,
            ...(mDef.supportsImages ? { supports_images: true } : {}),
            ...(mDef.supportsThinking ? { supports_thinking: true } : {}),
          };
        }
      }

      const quotaGroups = createWeeklyQuotaGroups(
        geminiWeeklyFraction,
        claudeWeeklyFraction,
        weeklyResetTimeStr,
      ).filter((g) => {
        if (g.display_name === 'Claude Weekly Shared') {
          return hasClaude;
        }
        if (g.display_name === 'Gemini Weekly Shared') {
          return hasGemini;
        }
        return true;
      });

      const quota: CloudQuotaData = {
        subscription_tier: tier,
        models: quotaModels,
        quota_groups: quotaGroups,
      };

      const newAccount: EmulatedAccountProfile = {
        id,
        is_emulated: true,
        provider,
        email,
        name: `${baseName} (Emulated)`,
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`,
        tier,
        strategy,
        status,
        status_reason,
        quota,
        created_at: timestamp,
        last_used: timestamp,
        is_active_ide: i === 0 && state.accounts.length === 0,
      };

      created.push(newAccount);
    }

    state.accounts.push(...created);
    this.saveState(state);

    if (state.enabled) {
      this.ensureTickerRunning();
    }

    return created;
  }

  static updateAccountStrategy(
    accountId: string,
    strategy: AccountEmulationStrategyConfig,
  ): EmulatedAccountProfile | null {
    const state = this.getState();
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) {
      return null;
    }
    account.strategy = strategy;
    this.saveState(state);
    return account;
  }

  static resetQuotas(): void {
    const state = this.getState();
    const resetTimeStr = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    const weeklyResetTimeStr = new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString();

    for (const account of state.accounts) {
      account.status = 'active';
      account.status_reason = undefined;
      for (const key of Object.keys(account.quota.models)) {
        const model = account.quota.models[key];
        if (model) {
          model.percentage = 100;
          model.resetTime = resetTimeStr;
        }
      }
      if (account.quota.quota_groups) {
        for (const group of account.quota.quota_groups) {
          for (const bucket of group.buckets) {
            bucket.remaining_fraction = 1.0;
            bucket.reset_time = weeklyResetTimeStr;
          }
        }
      }
    }
    this.saveState(state);
  }

  static clearAccounts(): void {
    const state = this.getState();
    state.accounts = [];
    this.saveState(state);
  }

  static deleteAccount(accountId: string): boolean {
    const state = this.getState();
    const initialLen = state.accounts.length;
    state.accounts = state.accounts.filter((a) => a.id !== accountId);
    if (state.accounts.length !== initialLen) {
      this.saveState(state);
      return true;
    }
    return false;
  }

  static switchAccount(accountId: string): void {
    const state = this.getState();
    for (const acc of state.accounts) {
      acc.is_active_ide = acc.id === accountId;
    }
    this.saveState(state);
  }

  static refreshAccountQuota(accountId: string): CloudAccount {
    const state = this.getState();
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`Emulated account not found: ${accountId}`);
    }

    if (account.status === 'rate_limited') {
      account.status = 'active';
      account.status_reason = undefined;
    }

    // Refresh recovers a portion of quota (simulate fresh window)
    for (const modelKey of Object.keys(account.quota.models)) {
      const model = account.quota.models[modelKey];
      if (model) {
        model.percentage = Math.min(100, model.percentage + 20);
      }
    }
    if (account.quota.quota_groups) {
      for (const group of account.quota.quota_groups) {
        for (const bucket of group.buckets) {
          bucket.remaining_fraction = Math.min(1.0, bucket.remaining_fraction + 0.2);
        }
      }
    }

    account.last_used = Date.now();
    this.saveState(state);

    return this.toCloudAccount(account);
  }

  /**
   * Applies one simulation step across all emulated accounts.
   */
  static applySimulationTick(): void {
    const state = this.getState();
    if (!state.enabled || state.accounts.length === 0) {
      return;
    }

    let changed = false;

    for (const account of state.accounts) {
      const strategy = account.strategy;

      if (strategy.type === 'rate_limited') {
        if (account.status !== 'rate_limited') {
          account.status = 'rate_limited';
          account.status_reason = 'RESOURCE_EXHAUSTED';
          changed = true;
        }
        continue;
      }

      if (account.status === 'rate_limited') {
        continue;
      }

      let drainPercent = 0;

      if (strategy.type === 'linear') {
        drainPercent = strategy.drainStepPercent || 3;
      } else if (strategy.type === 'bursty') {
        const isBurst = Math.random() < (strategy.rateLimitProbability || 0.25);
        drainPercent = isBurst ? strategy.drainStepPercent || 12 : Math.random() * 0.8;
      } else if (strategy.type === 'random_walk') {
        drainPercent = Math.floor(Math.random() * 5); // 0 to 4%
      } else if (strategy.type === 'static') {
        const target = strategy.targetPercentage ?? 10;
        for (const key of Object.keys(account.quota.models)) {
          const model = account.quota.models[key];
          if (model && model.percentage !== target) {
            model.percentage = target;
            changed = true;
          }
        }
        continue;
      } else if (strategy.type === 'auto_recover') {
        drainPercent = strategy.drainStepPercent || 5;
      }

      if (drainPercent > 0) {
        const drainResult = applyDrainStep(account.quota.models, account.quota.quota_groups, drainPercent);
        account.quota.models = drainResult.updatedModels;
        account.quota.quota_groups = drainResult.updatedGroups;
        changed = true;
        const allZero = drainResult.allDepleted;

        if (allZero && strategy.type === 'auto_recover') {
          // Auto recover after reaching zero: reset back to 100%
          for (const modelKey of Object.keys(account.quota.models)) {
            const model = account.quota.models[modelKey];
            if (model) {
              model.percentage = 100;
            }
          }
          if (account.quota.quota_groups) {
            for (const group of account.quota.quota_groups) {
              for (const bucket of group.buckets) {
                bucket.remaining_fraction = 1.0;
              }
            }
          }
          changed = true;
        }
      }
    }

    if (changed) {
      this.saveState(state);
    }
  }

  static ensureTickerRunning(): void {
    if (this.tickerTimer) {
      return;
    }
    const state = this.getState();
    if (!state.enabled) {
      return;
    }
    const intervalMs = Math.max(1000, state.tickIntervalSeconds * 1000);
    this.tickerTimer = setInterval(() => {
      this.applySimulationTick();
    }, intervalMs);
  }

  static stopTicker(): void {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
  }
}
