import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAccount, CloudQuotaData } from '@/modules/cloud-account/types';

vi.mock('@/modules/cloud-account/persistence/cloudHandler', () => ({
  CloudAccountRepo: {
    getAccounts: vi.fn(),
  },
}));

vi.mock('@/modules/cloud-account/persistence/cloud-account-settings-store', () => ({
  CloudAccountSettingsStore: {
    getSetting: vi.fn(),
    getActiveAccountIdForTarget: vi.fn(),
    getAutoSwitchEnabledForTarget: vi.fn(),
    isNoRestartEnabled: vi.fn(),
  },
}));

vi.mock('@/modules/cloud-account/services/cloud-account-switch.service', () => ({
  switchCloudAccountCore: vi.fn(),
}));

vi.mock('@/shared/logging/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createAccount(
  id: string,
  quota: CloudQuotaData,
  options: Partial<CloudAccount> = {},
): CloudAccount {
  return {
    id,
    provider: 'google',
    email: `${id}@example.com`,
    token: {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      expiry_timestamp: 1700000000,
      token_type: 'Bearer',
    },
    quota,
    created_at: 1700000000,
    last_used: 1700000000,
    status: 'active',
    ...options,
  };
}

function quotaWithClaudeGroup(modelPercentage: number, groupFraction: number): CloudQuotaData {
  return {
    models: {
      'claude-sonnet-4-5': {
        percentage: modelPercentage,
        resetTime: '',
      },
    },
    quota_groups: [
      {
        display_name: 'Claude and GPT models',
        buckets: [
          {
            bucket_id: '3p-5h',
            window: '5h',
            remaining_fraction: groupFraction,
            reset_time: '',
          },
        ],
      },
    ],
  };
}

function quotaWithArgonGroup(
  models: CloudQuotaData['models'],
  geminiWeeklyFraction: number,
  argonWeeklyFraction: number,
): CloudQuotaData {
  return {
    models,
    quota_groups: [
      {
        display_name: 'Gemini Models',
        description: 'Models within this group: Gemini Flash, Gemini Pro',
        buckets: [
          {
            bucket_id: 'gemini-weekly',
            window: 'weekly',
            remaining_fraction: geminiWeeklyFraction,
            reset_time: '',
          },
        ],
      },
      {
        display_name: 'Gemini 4 Argon',
        description:
          'For paid Pro plans, Argon quota is separate. Higher Argon quota (included as part of the larger Gemini quota bucket) is available on Ultra plans.',
        buckets: [
          {
            bucket_id: 'gemini-argon-wtu-weekly',
            window: 'weekly',
            remaining_fraction: argonWeeklyFraction,
            reset_time: '',
          },
        ],
      },
    ],
  };
}

describe('AutoSwitchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips an otherwise better account whose Claude/GPT group is exactly at 5%', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', quotaWithClaudeGroup(1, 0.01)),
      createAccount('model-high-group-boundary', quotaWithClaudeGroup(90, 0.05)),
      createAccount('model-medium-group-healthy', quotaWithClaudeGroup(45, 0.06)),
    ]);

    await expect(AutoSwitchService.findBestAccount('current')).resolves.toMatchObject({
      id: 'model-medium-group-healthy',
    });
  });

  it('respects enabled model configuration when checking depletion', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({});
    vi.mocked(CloudAccountSettingsStore.getActiveAccountIdForTarget).mockImplementation((target) => {
      if (target === 'ide') return 'acc-in-use-by-ide';
      return '';
    });

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', {
        models: { 'gemini-pro': { percentage: 1, resetTime: '' } },
      }),
      createAccount('acc-in-use-by-ide', {
        models: { 'gemini-pro': { percentage: 95, resetTime: '' } },
      }),
      createAccount('acc-free', {
        models: { 'gemini-pro': { percentage: 80, resetTime: '' } },
      }),
    ]);

    // When switching for 'classic', prefer 'acc-free' over 'acc-in-use-by-ide'
    await expect(AutoSwitchService.findBestAccount('current', 'classic')).resolves.toMatchObject({
      id: 'acc-free',
    });
  });

  it('falls back to shared account across targets when no other healthy candidate exists', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({});
    vi.mocked(CloudAccountSettingsStore.getActiveAccountIdForTarget).mockImplementation((target) => {
      if (target === 'ide') return 'acc-in-use-by-ide';
      return '';
    });

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', {
        models: { 'gemini-pro': { percentage: 1, resetTime: '' } },
      }),
      createAccount('acc-in-use-by-ide', {
        models: { 'gemini-pro': { percentage: 95, resetTime: '' } },
      }),
      createAccount('acc-depleted', {
        models: { 'gemini-pro': { percentage: 2, resetTime: '' } },
      }),
    ]);

    await expect(AutoSwitchService.findBestAccount('current', 'classic')).resolves.toMatchObject({
      id: 'acc-in-use-by-ide',
    });
  });

  it('prioritizes accounts nearing weekly quota reset that still have high weekly quota', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const now = Date.parse('2026-09-12T10:00:00Z');
    const resetSoon = new Date(now + 4 * 3600 * 1000).toISOString();
    const resetFar = new Date(now + 120 * 3600 * 1000).toISOString();

    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({});
    vi.mocked(CloudAccountSettingsStore.getActiveAccountIdForTarget).mockReturnValue('');

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', {
        models: { 'gemini-pro': { percentage: 0, resetTime: '' } },
      }),
      createAccount('acc-expiring-weekly', {
        models: { 'gemini-pro': { percentage: 80, resetTime: '' } },
        quota_groups: [
          {
            display_name: 'Gemini Pro',
            buckets: [
              {
                bucket_id: 'weekly',
                window: 'week',
                remaining_fraction: 0.85,
                reset_time: resetSoon,
              },
            ],
          },
        ],
      }),
      createAccount('acc-not-expiring', {
        models: { 'gemini-pro': { percentage: 82, resetTime: '' } },
        quota_groups: [
          {
            display_name: 'Gemini Pro',
            buckets: [
              {
                bucket_id: 'weekly',
                window: 'week',
                remaining_fraction: 0.85,
                reset_time: resetFar,
              },
            ],
          },
        ],
      }),
    ]);

    await expect(
      AutoSwitchService.findBestAccount('current', undefined, now),
    ).resolves.toMatchObject({
      id: 'acc-expiring-weekly',
    });
  });

  it('applies a depleted Gemini 4 Argon group only to enabled Argon models', async () => {
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const flashOnly = createAccount(
      'flash-only',
      quotaWithArgonGroup({ 'gemini-3.8-flash-high': { percentage: 90, resetTime: '' } }, 0.9, 0),
    );
    const withArgonModel = createAccount(
      'with-argon-model',
      quotaWithArgonGroup(
        {
          'gemini-3.8-flash-high': { percentage: 90, resetTime: '' },
          'models/gemini-4-argon-high': { percentage: 80, resetTime: '' },
        },
        0.9,
        0,
      ),
    );

    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({});
    const argonEnabled = {
      flashOnly: AutoSwitchService.isAccountDepleted(flashOnly),
      withArgonModel: AutoSwitchService.isAccountDepleted(withArgonModel),
    };
    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({
      'gemini-4-argon-high': { enabled: false, priority: false },
    });
    const argonDisabled = AutoSwitchService.isAccountDepleted(withArgonModel);

    expect({ argonEnabled, argonDisabled }).toEqual({
      argonEnabled: { flashOnly: false, withArgonModel: true },
      argonDisabled: false,
    });
  });

  it('does not let a dedicated Gemini 4 Argon group lower other Gemini cohort scores', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const flash = (percentage: number) => ({
      'gemini-3.8-flash-high': { percentage, resetTime: '' },
    });
    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({});
    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', quotaWithArgonGroup(flash(50), 0.5, 1)),
      createAccount('flash-high-argon-exhausted', quotaWithArgonGroup(flash(90), 0.9, 0)),
      createAccount('flash-medium-argon-full', quotaWithArgonGroup(flash(60), 0.6, 1)),
    ]);

    await expect(AutoSwitchService.findBestAccount('current')).resolves.toMatchObject({
      id: 'flash-high-argon-exhausted',
    });
  });

  it('prioritizes accounts nearing 5h block reset that still have high quota', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const now = Date.parse('2026-09-12T10:00:00Z');
    const reset15m = new Date(now + 15 * 60 * 1000).toISOString();
    const reset4h = new Date(now + 4 * 3600 * 1000).toISOString();

    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({});
    vi.mocked(CloudAccountSettingsStore.getActiveAccountIdForTarget).mockReturnValue('');

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', {
        models: { 'gemini-pro': { percentage: 0, resetTime: '' } },
      }),
      createAccount('acc-expiring-5h', {
        models: {
          'gemini-pro': { percentage: 75, resetTime: reset15m },
        },
      }),
      createAccount('acc-fresh-5h', {
        models: {
          'gemini-pro': { percentage: 78, resetTime: reset4h },
        },
      }),
    ]);

    await expect(
      AutoSwitchService.findBestAccount('current', undefined, now),
    ).resolves.toMatchObject({
      id: 'acc-expiring-5h',
    });
  });

  it('switches using markActiveAccount when isNoRestartEnabled is true for GUI targets', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const markActiveAccount = vi.fn().mockResolvedValue(undefined);
    const switchAccount = vi.fn().mockResolvedValue(undefined);
    AutoSwitchService.configureEffects({
      markActiveAccount,
      switchAccount,
      onSwitched: vi.fn(),
    });

    vi.mocked(CloudAccountSettingsStore.getAutoSwitchEnabledForTarget).mockReturnValue(true);
    vi.mocked(CloudAccountSettingsStore.isNoRestartEnabled).mockReturnValue(true);
    vi.mocked(CloudAccountSettingsStore.getActiveAccountIdForTarget).mockReturnValue('acc-depleted');

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('acc-depleted', {
        models: { 'gemini-pro': { percentage: 2, resetTime: '' } },
      }),
      createAccount('acc-healthy', {
        models: { 'gemini-pro': { percentage: 90, resetTime: '' } },
      }),
    ]);

    const switched = await AutoSwitchService.checkAndSwitchIfNeeded('ide');
    expect(switched).toBe(true);
    expect(markActiveAccount).toHaveBeenCalledWith('acc-healthy', 'ide');
    expect(switchAccount).not.toHaveBeenCalled();
  });
});
