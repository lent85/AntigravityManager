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

vi.mock('@/modules/cloud-account/ipc/handler', () => ({
  switchCloudAccount: vi.fn(),
  markActiveAccount: vi.fn(),
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

describe('AutoSwitchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips accounts whose Claude/GPT grouped quota bucket is depleted', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', quotaWithClaudeGroup(1, 0.01)),
      createAccount('model-high-group-low', quotaWithClaudeGroup(90, 0.02)),
      createAccount('model-medium-group-healthy', quotaWithClaudeGroup(45, 0.8)),
    ]);

    await expect(AutoSwitchService.findBestAccount('current')).resolves.toMatchObject({
      id: 'model-medium-group-healthy',
    });
  });

  it('respects enabled model configuration when checking depletion', async () => {
    // eslint-disable-next-line unused-imports/no-unused-vars
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const config = {
      'claude-sonnet-4-5': { enabled: false, priority: false },
      'gemini-pro': { enabled: true, priority: false },
    };
    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue(config);

    const testAccount = createAccount('test-acc', {
      models: {
        'claude-sonnet-4-5': { percentage: 2, resetTime: '' },
        'gemini-pro': { percentage: 90, resetTime: '' },
      },
    });

    // Depleted should be false because claude-sonnet-4-5 is disabled!
    expect(AutoSwitchService.isAccountDepleted(testAccount)).toBe(false);
  });

  it('applies unprefixed model settings to prefixed quota model identifiers', async () => {
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({
      'claude-sonnet-4-5': { enabled: false, priority: false },
      'gemini-pro': { enabled: true, priority: false },
    });

    const testAccount = createAccount('prefixed-models', {
      models: {
        'models/claude-sonnet-4-5': { percentage: 1, resetTime: '' },
        'models/gemini-pro': { percentage: 90, resetTime: '' },
      },
    });

    expect(AutoSwitchService.isAccountDepleted(testAccount)).toBe(false);
  });

  it('uses unprefixed priority settings when quota identifiers are prefixed', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({
      'claude-sonnet-4-5': { enabled: true, priority: true },
      'gemini-pro': { enabled: true, priority: false },
    });

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', {
        models: {
          'models/claude-sonnet-4-5': { percentage: 50, resetTime: '' },
          'models/gemini-pro': { percentage: 90, resetTime: '' },
        },
      }),
      createAccount('priority-high', {
        models: {
          'models/claude-sonnet-4-5': { percentage: 80, resetTime: '' },
          'models/gemini-pro': { percentage: 10, resetTime: '' },
        },
      }),
      createAccount('priority-low', {
        models: {
          'models/claude-sonnet-4-5': { percentage: 60, resetTime: '' },
          'models/gemini-pro': { percentage: 95, resetTime: '' },
        },
      }),
    ]);

    await expect(AutoSwitchService.findBestAccount('current')).resolves.toMatchObject({
      id: 'priority-high',
    });
  });

  it('uses the best quota in an alias group and keeps the threshold comparison strict', async () => {
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const accountWithHealthySibling = createAccount('healthy-sibling', {
      models: {
        'gemini-3.1-pro-low': { percentage: 0, resetTime: '' },
        'gemini-3.1-pro-high': { percentage: 80, resetTime: '' },
        'gemini-3.1-flash-image': { percentage: 5, resetTime: '' },
      },
    });
    const accountWithDepletedGroup = createAccount('depleted-group', {
      models: {
        'gemini-3.1-pro-low': { percentage: 0, resetTime: '' },
        'gemini-3.1-pro-high': { percentage: 4, resetTime: '' },
      },
    });

    expect({
      healthySibling: AutoSwitchService.isAccountDepleted(accountWithHealthySibling),
      depletedGroup: AutoSwitchService.isAccountDepleted(accountWithDepletedGroup),
    }).toEqual({
      healthySibling: false,
      depletedGroup: true,
    });
  });

  it('matches depleted quota groups for models-prefixed identifiers', async () => {
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const prefixedModelAccount = createAccount('prefixed-model', {
      models: {
        'models/gemini-flash': { percentage: 90, resetTime: '' },
      },
      quota_groups: [
        {
          display_name: 'Gemini models',
          buckets: [
            {
              bucket_id: 'gemini-group',
              window: '5h',
              remaining_fraction: 0.01,
              reset_time: '',
            },
          ],
        },
      ],
    });

    expect(AutoSwitchService.isAccountDepleted(prefixedModelAccount)).toBe(true);
  });

  it('prioritizes priority models during best account selection', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const config = {
      'claude-sonnet-4-5': { enabled: true, priority: true },
      'gemini-pro': { enabled: true, priority: false },
    };
    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue(config);

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', {
        models: {
          'claude-sonnet-4-5': { percentage: 50, resetTime: '' },
          'gemini-pro': { percentage: 90, resetTime: '' },
        },
      }),
      // Acc A has lower overall average (45% vs 75%) but HIGHER priority model percentage (80% vs 60%)
      createAccount('acc-a', {
        models: {
          'claude-sonnet-4-5': { percentage: 80, resetTime: '' },
          'gemini-pro': { percentage: 10, resetTime: '' },
        },
      }),
      createAccount('acc-b', {
        models: {
          'claude-sonnet-4-5': { percentage: 60, resetTime: '' },
          'gemini-pro': { percentage: 90, resetTime: '' },
        },
      }),
    ]);

    await expect(AutoSwitchService.findBestAccount('current')).resolves.toMatchObject({
      id: 'acc-a',
    });
  });

  it('prefers an account that exposes a configured priority model over a higher fallback score', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    vi.mocked(CloudAccountSettingsStore.getSetting).mockReturnValue({
      'claude-sonnet-4-5': { enabled: true, priority: true },
      'gemini-pro': { enabled: true, priority: false },
    });

    vi.mocked(CloudAccountRepo.getAccounts).mockResolvedValue([
      createAccount('current', {
        models: {
          'claude-sonnet-4-5': { percentage: 50, resetTime: '' },
        },
      }),
      createAccount('priority-present', {
        models: {
          'claude-sonnet-4-5': { percentage: 60, resetTime: '' },
          'gemini-pro': { percentage: 10, resetTime: '' },
        },
      }),
      createAccount('priority-missing', {
        models: {
          'gemini-pro': { percentage: 100, resetTime: '' },
        },
      }),
    ]);

    await expect(AutoSwitchService.findBestAccount('current')).resolves.toMatchObject({
      id: 'priority-present',
    });
  });

  it('isolates targets to avoid sharing accounts when non-overlapping candidates are available', async () => {
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
    const resetSoon = new Date(now + 4 * 3600 * 1000).toISOString(); // 4 hours away
    const resetFar = new Date(now + 120 * 3600 * 1000).toISOString(); // 5 days away

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

  it('prioritizes accounts nearing 5h block reset that still have high quota', async () => {
    const { CloudAccountRepo } = await import('@/modules/cloud-account/persistence/cloudHandler');
    const { CloudAccountSettingsStore } =
      await import('@/modules/cloud-account/persistence/cloud-account-settings-store');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

    const now = Date.parse('2026-09-12T10:00:00Z');
    const reset15m = new Date(now + 15 * 60 * 1000).toISOString(); // 15 mins away
    const reset4h = new Date(now + 4 * 3600 * 1000).toISOString(); // 4 hours away

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
    const { markActiveAccount, switchCloudAccount } =
      await import('@/modules/cloud-account/ipc/handler');
    const { AutoSwitchService } =
      await import('@/modules/cloud-account/services/AutoSwitchService');

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
    expect(switchCloudAccount).not.toHaveBeenCalled();
  });
});
