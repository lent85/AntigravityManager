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
import { randomUUID } from 'node:crypto';

export interface SimulationModelDefinition {
  id: string;
  displayName: string;
  provider: 'google' | 'anthropic' | 'other';
  supportsThinking?: boolean;
  supportsImages?: boolean;
}

export const SIMULATION_MODERN_MODELS: readonly SimulationModelDefinition[] = [
  // Gemini modern models
  { id: 'gemini-3.1-pro-high', displayName: 'Gemini 3.1 Pro (High)', provider: 'google', supportsThinking: true, supportsImages: true },
  { id: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)', provider: 'google', supportsThinking: true, supportsImages: true },
  { id: 'gemini-3.5-flash-high', displayName: 'Gemini 3.5 Flash (High)', provider: 'google', supportsThinking: true, supportsImages: true },
  { id: 'gemini-3.5-flash-medium', displayName: 'Gemini 3.5 Flash (Medium)', provider: 'google', supportsImages: true },
  { id: 'gemini-3-flash', displayName: 'Gemini 3 Flash', provider: 'google', supportsImages: true },
  { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', provider: 'google', supportsThinking: true, supportsImages: true },
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: 'google', supportsImages: true },
  { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite', provider: 'google' },
  { id: 'gemini-3-pro-image', displayName: 'Gemini 3 Pro Image', provider: 'google', supportsImages: true },
  { id: 'gemini-3.1-flash-image', displayName: 'Gemini 3.1 Flash Image', provider: 'google', supportsImages: true },

  // Claude modern models
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', provider: 'anthropic', supportsThinking: true },
  { id: 'claude-sonnet-4-6-thinking', displayName: 'Claude Sonnet 4.6 (Thinking)', provider: 'anthropic', supportsThinking: true },
  { id: 'claude-opus-4-6-thinking', displayName: 'Claude Opus 4.6 (Thinking)', provider: 'anthropic', supportsThinking: true },
  { id: 'claude-3-7-sonnet', displayName: 'Claude 3.7 Sonnet', provider: 'anthropic', supportsThinking: true },
  { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic', supportsThinking: true },
  { id: 'claude-3-5-haiku', displayName: 'Claude 3.5 Haiku', provider: 'anthropic' },

  // Open-weight / Other models
  { id: 'gpt-oss-120b-medium', displayName: 'GPT-OSS 120B (Medium)', provider: 'other' },
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
    return parsed.data as EmulationState;
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
        access_token: `mock_access_token_${profile.id}`,
        refresh_token: `mock_refresh_token_${profile.id}`,
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
    const shouldRandomizeModels = options?.randomizeModels === true || preset === 'random_modern_mix';

    for (let i = 0; i < count; i++) {
      const idx = (state.accounts.length + i) % MOCK_NAMES.length;
      const baseName = MOCK_NAMES[idx] || `Tester ${state.accounts.length + i + 1}`;
      const uniqueSuffix = randomUUID().slice(0, 4);
      const email = `${baseName.toLowerCase().replace(/\s+/g, '.')}.${uniqueSuffix}@sim.mock`;
      const id = `emulated-${randomUUID()}`;
      const provider: 'google' | 'anthropic' = i % 4 === 3 ? 'anthropic' : 'google';

      let tier: 'Free' | 'Pro' | 'Ultra' = 'Pro';
      let status: 'active' | 'rate_limited' | 'expired' = 'active';
      let status_reason: string | undefined;
      let strategy: AccountEmulationStrategyConfig = {
        type: 'linear',
        drainStepPercent: 3,
        tickIntervalSeconds: state.tickIntervalSeconds,
      };

      let initialPercentages: { geminiPro: number; geminiFlash: number; claudeSonnet: number; weeklyFraction: number } = {
        geminiPro: 85,
        geminiFlash: 90,
        claudeSonnet: 75,
        weeklyFraction: 0.8,
      };

      const ratio = Math.max(0.1, 1 - (i * 0.2) % 0.85);

      if (preset === 'drain_demo') {
        strategy = {
          type: 'linear',
          drainStepPercent: 4,
          tickIntervalSeconds: state.tickIntervalSeconds,
        };
        initialPercentages = {
          geminiPro: 92,
          geminiFlash: 95,
          claudeSonnet: 88,
          weeklyFraction: 0.9,
        };
      } else if (preset === 'auto_switch_test_bench') {
        if (i === 0) {
          // Account 1: Low quota (< 5%) to trigger auto-switch
          initialPercentages = {
            geminiPro: 4,
            geminiFlash: 3,
            claudeSonnet: 2,
            weeklyFraction: 0.04,
          };
          strategy = { type: 'linear', drainStepPercent: 1, tickIntervalSeconds: state.tickIntervalSeconds };
        } else if (i === 1) {
          // Account 2: Rate limited
          status = 'rate_limited';
          status_reason = 'RESOURCE_EXHAUSTED (Emulated quota exhaustion)';
          strategy = { type: 'rate_limited', drainStepPercent: 0, tickIntervalSeconds: state.tickIntervalSeconds };
          initialPercentages = { geminiPro: 0, geminiFlash: 0, claudeSonnet: 0, weeklyFraction: 0 };
        } else {
          // Healthy backup accounts
          tier = i % 2 === 0 ? 'Ultra' : 'Pro';
          initialPercentages = {
            geminiPro: 88,
            geminiFlash: 94,
            claudeSonnet: 82,
            weeklyFraction: 0.85,
          };
          strategy = { type: 'linear', drainStepPercent: 2, tickIntervalSeconds: state.tickIntervalSeconds };
        }
      } else if (preset === 'bursty_workload') {
        strategy = {
          type: 'bursty',
          drainStepPercent: 12,
          tickIntervalSeconds: state.tickIntervalSeconds,
          rateLimitProbability: 0.25,
        };
        initialPercentages = {
          geminiPro: 70,
          geminiFlash: 85,
          claudeSonnet: 60,
          weeklyFraction: 0.65,
        };
      } else if (preset === 'rate_limited_test') {
        status = 'rate_limited';
        status_reason = 'RESOURCE_EXHAUSTED (HTTP 429 Simulated)';
        strategy = { type: 'rate_limited', drainStepPercent: 0, tickIntervalSeconds: state.tickIntervalSeconds };
        initialPercentages = { geminiPro: 0, geminiFlash: 0, claudeSonnet: 0, weeklyFraction: 0 };
      } else if (preset === 'random_modern_mix') {
        const tiers: Array<'Free' | 'Pro' | 'Ultra'> = ['Free', 'Pro', 'Ultra'];
        tier = tiers[i % tiers.length] || 'Pro';
        strategy = {
          type: i % 2 === 0 ? 'linear' : 'bursty',
          drainStepPercent: Math.floor(Math.random() * 3) + 2,
          tickIntervalSeconds: state.tickIntervalSeconds,
          rateLimitProbability: 0.2,
        };
      } else {
        // balanced_pool
        const tiers: Array<'Free' | 'Pro' | 'Ultra'> = ['Free', 'Pro', 'Ultra'];
        tier = tiers[i % tiers.length] || 'Pro';
        initialPercentages = {
          geminiPro: Math.round(ratio * 100),
          geminiFlash: Math.round(ratio * 95),
          claudeSonnet: Math.round(ratio * 90),
          weeklyFraction: ratio,
        };
        strategy = { type: 'linear', drainStepPercent: 2, tickIntervalSeconds: state.tickIntervalSeconds };
      }

      const resetTimeStr = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
      const quotaModels: CloudQuotaData['models'] = {};
      const quotaGroups: NonNullable<CloudQuotaData['quota_groups']> = [];

      if (shouldRandomizeModels) {
        const minModels = Math.max(1, Math.min(options?.minModelsPerAccount ?? 2, SIMULATION_MODERN_MODELS.length));
        const maxModels = Math.max(minModels, Math.min(options?.maxModelsPerAccount ?? 10, SIMULATION_MODERN_MODELS.length));
        const targetModelCount = Math.floor(Math.random() * (maxModels - minModels + 1)) + minModels;

        const geminiPool = SIMULATION_MODERN_MODELS.filter(
          (m) => m.provider === 'google' || m.id.toLowerCase().includes('gemini'),
        ).sort(() => Math.random() - 0.5);

        const claudePool = SIMULATION_MODERN_MODELS.filter(
          (m) => m.provider === 'anthropic' || m.id.toLowerCase().includes('claude'),
        ).sort(() => Math.random() - 0.5);

        const selectedModelDefs: SimulationModelDefinition[] = [];

        // Ensure at least one Gemini and at least one Claude model
        if (geminiPool.length > 0) {
          selectedModelDefs.push(geminiPool.shift()!);
        }
        if (claudePool.length > 0) {
          selectedModelDefs.push(claudePool.shift()!);
        }

        // Remaining pool contains all other models without duplicates
        const remainingPool = [
          ...geminiPool,
          ...claudePool,
          ...SIMULATION_MODERN_MODELS.filter((m) => !selectedModelDefs.some((s) => s.id === m.id)),
        ]
          .filter((m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx)
          .sort(() => Math.random() - 0.5);

        while (selectedModelDefs.length < targetModelCount && remainingPool.length > 0) {
          selectedModelDefs.push(remainingPool.shift()!);
        }

        let hasClaude = false;
        let hasGemini = false;

        for (const mDef of selectedModelDefs) {
          if (mDef.provider === 'anthropic' || mDef.id.includes('claude')) {
            hasClaude = true;
          }
          if (mDef.provider === 'google' || mDef.id.includes('gemini')) {
            hasGemini = true;
          }

          let modelPercentage = 80;
          if (status === 'rate_limited') {
            modelPercentage = 0;
          } else if (preset === 'auto_switch_test_bench' && i === 0) {
            modelPercentage = Math.floor(Math.random() * 4) + 1; // 1-4%
          } else if (preset === 'drain_demo') {
            modelPercentage = Math.floor(Math.random() * 15) + 84; // 84-98%
          } else if (preset === 'bursty_workload') {
            modelPercentage = Math.floor(Math.random() * 45) + 40; // 40-85%
          } else if (preset === 'random_modern_mix') {
            modelPercentage = Math.floor(Math.random() * 80) + 20; // 20-99%
          } else {
            const basePct = Math.round(ratio * 100);
            const variation = Math.floor(Math.random() * 21) - 10;
            modelPercentage = Math.max(5, Math.min(100, basePct + variation));
          }

          quotaModels[mDef.id] = {
            percentage: modelPercentage,
            resetTime: resetTimeStr,
            display_name: mDef.displayName,
            ...(mDef.supportsImages ? { supports_images: true } : {}),
            ...(mDef.supportsThinking ? { supports_thinking: true } : {}),
          };
        }

        const weeklyFraction = status === 'rate_limited' ? 0 : Math.max(0.1, Number(ratio.toFixed(2)));
        const weeklyResetTime = new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString();

        if (hasClaude) {
          quotaGroups.push({
            display_name: 'Claude Weekly Shared',
            buckets: [
              {
                bucket_id: 'claude-weekly',
                window: 'weekly',
                remaining_fraction: weeklyFraction,
                reset_time: weeklyResetTime,
                display_name: 'Claude Sonnet 4-6 Weekly',
              },
            ],
          });
        }
        if (hasGemini) {
          quotaGroups.push({
            display_name: 'Gemini Weekly Shared',
            buckets: [
              {
                bucket_id: 'gemini-weekly',
                window: 'weekly',
                remaining_fraction: weeklyFraction,
                reset_time: weeklyResetTime,
                display_name: 'Gemini 3 Flash Weekly',
              },
            ],
          });
        }
      } else {
        quotaModels['gemini-2.5-pro'] = {
          percentage: initialPercentages.geminiPro,
          resetTime: resetTimeStr,
          display_name: 'Gemini 2.5 Pro',
          supports_images: true,
          supports_thinking: true,
        };
        quotaModels['gemini-2.5-flash'] = {
          percentage: initialPercentages.geminiFlash,
          resetTime: resetTimeStr,
          display_name: 'Gemini 2.5 Flash',
          supports_images: true,
        };
        quotaModels['claude-3-5-sonnet'] = {
          percentage: initialPercentages.claudeSonnet,
          resetTime: resetTimeStr,
          display_name: 'Claude 3.5 Sonnet',
          supports_thinking: true,
        };

        quotaGroups.push(
          {
            display_name: 'Claude Weekly Shared',
            buckets: [
              {
                bucket_id: 'claude-weekly',
                window: 'weekly',
                remaining_fraction: initialPercentages.weeklyFraction,
                reset_time: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
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
                remaining_fraction: initialPercentages.weeklyFraction,
                reset_time: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
                display_name: 'Gemini 3 Flash Weekly',
              },
            ],
          },
        );
      }

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
          account.status_reason = 'RESOURCE_EXHAUSTED (Simulated Rate Limit)';
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
        let allZero = true;
        for (const modelKey of Object.keys(account.quota.models)) {
          const model = account.quota.models[modelKey];
          if (model) {
            const nextVal = Math.max(0, model.percentage - drainPercent);
            if (nextVal !== model.percentage) {
              model.percentage = nextVal;
              changed = true;
            }
            if (nextVal > 0) {
              allZero = false;
            }
          }
        }

        const fractionDrain = drainPercent / 100;
        if (account.quota.quota_groups) {
          for (const group of account.quota.quota_groups) {
            for (const bucket of group.buckets) {
              const nextFraction = Math.max(0, bucket.remaining_fraction - fractionDrain);
              if (nextFraction !== bucket.remaining_fraction) {
                bucket.remaining_fraction = Number(nextFraction.toFixed(4));
                changed = true;
              }
            }
          }
        }

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
