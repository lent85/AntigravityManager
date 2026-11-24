import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  autoSwitchEnabled: true,
  getAccounts: vi.fn(async () => []),
  getSetting: vi.fn((key: string, defaultValue: unknown) => {
    if (key === 'metrics_poll_interval_minutes') {
      return 0;
    }
    return key === 'auto_switch_enabled' ? mocks.autoSwitchEnabled : defaultValue;
  }),
  checkAndSwitchIfNeeded: vi.fn(async () => false),
}));

vi.mock('electron', () => ({
  Notification: class Notification {
    show() {}
  },
}));

vi.mock('@/modules/cloud-account/persistence/cloudHandler', () => ({
  CloudAccountRepo: {
    getAccounts: mocks.getAccounts,
  },
}));

vi.mock('@/modules/cloud-account/persistence/cloud-account-settings-store', () => ({
  CloudAccountSettingsStore: {
    getSetting: mocks.getSetting,
  },
}));

vi.mock('@/modules/cloud-account/services/GoogleAPIService', () => ({
  GoogleAPIService: {
    normalizeRefreshedOAuthClientKey: vi.fn(),
  },
}));

vi.mock('@/modules/cloud-account/services/AutoSwitchService', () => ({
  AutoSwitchService: {
    isAutoSwitchEnabledForTarget: () => mocks.autoSwitchEnabled,
    checkAndSwitchIfNeeded: mocks.checkAndSwitchIfNeeded,
  },
}));
vi.mock('@/shared/platform/paths', async (original) => ({
  ...(await original<typeof import('@/shared/platform/paths')>()),
  getAntigravityStoragePaths: () => [],
}));
vi.mock('@/modules/antigravity-runtime/binary-patch/agyCliPathDetection', () => ({
  detectAgyCliExecutablePath: () => null,
}));

vi.mock('@/shared/logging/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/modules/cloud-account/utils/account-status', () => ({
  classifyAccountStatusFromError: vi.fn(() => null),
}));

import { CloudMonitorService } from '@/modules/cloud-account/services/CloudMonitorService';

describe('CloudMonitorService runtime auto-switch toggles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.autoSwitchEnabled = true;
    mocks.getAccounts.mockClear();
    mocks.getSetting.mockClear();
    mocks.checkAndSwitchIfNeeded.mockClear();
    CloudMonitorService.resetStateForTesting();
  });

  afterEach(() => {
    CloudMonitorService.resetStateForTesting();
    vi.useRealTimers();
  });

  it('starts recurring monitoring when an enabled setting triggers an immediate poll', async () => {
    await CloudMonitorService.poll();

    expect(mocks.getAccounts).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 1000);

    expect(mocks.getAccounts).toHaveBeenCalledTimes(2);
  });

  it('stops the recurring timer after auto-switch is disabled at runtime', async () => {
    await CloudMonitorService.poll();
    expect(mocks.getAccounts).toHaveBeenCalledTimes(1);

    mocks.autoSwitchEnabled = false;
    await vi.advanceTimersByTimeAsync(60 * 1000);
    await vi.advanceTimersByTimeAsync(60 * 1000);

    expect(mocks.getAccounts).toHaveBeenCalledTimes(1);
  });

  it('keeps an interrupted round paused until resume and coalesces wake events', async () => {
    let release!: () => void;
    mocks.getAccounts.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return [];
    });
    const poll = CloudMonitorService.poll();
    CloudMonitorService.handleAppSuspend();
    release();
    await poll;
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(mocks.getAccounts).toHaveBeenCalledTimes(1);
    await CloudMonitorService.handleAppFocus();
    expect(mocks.getAccounts).toHaveBeenCalledTimes(1);

    await Promise.all([
      CloudMonitorService.handleAppResume(),
      CloudMonitorService.handleAppResume(),
    ]);
    expect(mocks.getAccounts).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(mocks.getAccounts).toHaveBeenCalledTimes(3);
  });

  it('does not reopen admission when shutdown overtakes resume', async () => {
    let release!: () => void;
    mocks.getAccounts.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return [];
    });
    const poll = CloudMonitorService.poll();
    CloudMonitorService.handleAppSuspend();
    const resume = CloudMonitorService.handleAppResume();
    CloudMonitorService.closeAdmission();
    release();
    await Promise.all([poll, resume]);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(mocks.getAccounts).toHaveBeenCalledTimes(1);
  });

  it('allows a newer wake to supersede recovery still waiting for an old round', async () => {
    const barrier = Promise.withResolvers<void>();
    mocks.getAccounts.mockImplementationOnce(async () => {
      await barrier.promise;
      return [];
    });
    const poll = CloudMonitorService.poll();
    CloudMonitorService.handleAppSuspend();
    const firstWake = CloudMonitorService.handleAppResume();
    CloudMonitorService.handleAppSuspend();
    const secondWake = CloudMonitorService.handleAppResume();
    barrier.resolve();
    await Promise.all([poll, firstWake, secondWake]);
    expect(mocks.getAccounts).toHaveBeenCalledTimes(2);
  });
});
