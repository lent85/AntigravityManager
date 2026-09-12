import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountEmulationService,
  SIMULATION_MODERN_MODELS,
} from '@/modules/cloud-account/emulation/AccountEmulationService';
import { CloudAccountSettingsStore } from '@/modules/cloud-account/persistence/cloud-account-settings-store';

describe('AccountEmulationService', () => {
  let memoryStore: Record<string, unknown> = {};

  beforeEach(() => {
    memoryStore = {};
    AccountEmulationService.stopTicker();

    // Mock storage in-memory
    CloudAccountSettingsStore.getSetting = ((key: string, defaultValue: unknown) => {
      const val = memoryStore[key];
      return val !== undefined ? val : defaultValue;
    }) as any;

    CloudAccountSettingsStore.setSetting = ((key: string, value: unknown) => {
      memoryStore[key] = value;
    }) as any;
  });

  it('starts disabled with empty accounts by default', () => {
    const state = AccountEmulationService.getState();
    assert.equal(state.enabled, false);
    assert.deepEqual(state.accounts, []);
    assert.equal(AccountEmulationService.isEnabled(), false);
  });

  it('toggles enabled state and updates settings store', () => {
    AccountEmulationService.setEnabled(true);
    assert.equal(AccountEmulationService.isEnabled(), true);
    AccountEmulationService.setEnabled(false);
    assert.equal(AccountEmulationService.isEnabled(), false);
  });

  it('generates accounts with valid schema and models', () => {
    const accounts = AccountEmulationService.generateAccounts(3, 'balanced_pool');
    assert.equal(accounts.length, 3);
    for (const acc of accounts) {
      assert.match(acc.id, /^emulated-/);
      assert.equal(acc.is_emulated, true);
      assert.ok(acc.quota.models['gemini-3.1-pro']);
      assert.ok(acc.quota.models['gemini-3.8-flash-high']);
      assert.ok(acc.quota.models['claude-sonnet-4-6']);
      assert.ok(acc.quota.quota_groups);
    }
  });

  it('generates auto_switch_test_bench with a low quota candidate and a rate-limited candidate', () => {
    const accounts = AccountEmulationService.generateAccounts(3, 'auto_switch_test_bench');
    assert.equal(accounts.length, 3);
    // First account is critically low (<5%)
    assert.ok(accounts[0].quota.models['gemini-3.8-flash-high'].percentage <= 5);
    // Second account is rate-limited
    assert.equal(accounts[1].status, 'rate_limited');
    // Third account is healthy backup
    assert.ok(accounts[2].quota.models['gemini-3.8-flash-high'].percentage > 50);
  });

  it('applies linear drain simulation tick', () => {
    AccountEmulationService.setEnabled(true);
    const [acc] = AccountEmulationService.generateAccounts(1, 'drain_demo');
    const initialSonnet = acc.quota.models['claude-sonnet-4-6'].percentage;

    AccountEmulationService.applySimulationTick();

    const state = AccountEmulationService.getState();
    const updated = state.accounts.find((a) => a.id === acc.id);
    assert.ok(updated);
    assert.equal(
      updated.quota.models['claude-sonnet-4-6'].percentage,
      initialSonnet - acc.strategy.drainStepPercent,
    );
  });

  it('resets all quotas to 100% and recovers rate limits', () => {
    const accounts = AccountEmulationService.generateAccounts(2, 'auto_switch_test_bench');
    assert.equal(accounts[1].status, 'rate_limited');

    AccountEmulationService.resetQuotas();

    const state = AccountEmulationService.getState();
    for (const acc of state.accounts) {
      assert.equal(acc.status, 'active');
      for (const model of Object.values(acc.quota.models)) {
        assert.equal(model.percentage, 100);
      }
    }
  });

  it('clears emulated accounts safely', () => {
    AccountEmulationService.generateAccounts(3);
    assert.equal(AccountEmulationService.getEmulatedAccounts().length, 3);

    AccountEmulationService.clearAccounts();
    assert.equal(AccountEmulationService.getEmulatedAccounts().length, 0);
  });

  it('deletes a single account correctly', () => {
    const created = AccountEmulationService.generateAccounts(2);
    const idToDelete = created[0].id;

    const result = AccountEmulationService.deleteAccount(idToDelete);
    assert.equal(result, true);
    assert.equal(AccountEmulationService.getEmulatedAccounts().length, 1);
    assert.notEqual(AccountEmulationService.getEmulatedAccounts()[0].id, idToDelete);
  });

  it('switches emulated account active state in memory without touching real db', () => {
    const created = AccountEmulationService.generateAccounts(2);
    const targetId = created[1].id;

    AccountEmulationService.switchAccount(targetId);
    const accounts = AccountEmulationService.getEmulatedAccounts();
    assert.equal(accounts[0].is_active_ide, false);
    assert.equal(accounts[1].is_active_ide, true);
  });

  it('generates accounts with full modern Google model catalog and unified group quotas', () => {
    const accounts = AccountEmulationService.generateAccounts(10, 'random_modern_mix');
    assert.equal(accounts.length, 10);

    const geminiPercentages = new Set<number>();
    const claudePercentages = new Set<number>();

    for (const acc of accounts) {
      const keys = Object.keys(acc.quota.models);
      // All accounts must have the full catalog of 18 models
      assert.equal(keys.length, SIMULATION_MODERN_MODELS.length);

      const geminiKeys = keys.filter((k) => k.toLowerCase().includes('gemini'));
      const claudeKeys = keys.filter((k) => k.toLowerCase().includes('claude'));
      assert.ok(geminiKeys.length >= 16, `Account ${acc.id} must include all Gemini models`);
      assert.ok(claudeKeys.length >= 2, `Account ${acc.id} must include all Claude models`);

      // All Gemini models in this account must have identical percentage and resetTime
      const firstGemini = acc.quota.models[geminiKeys[0]]!;
      for (const k of geminiKeys) {
        const m = acc.quota.models[k]!;
        assert.equal(m.percentage, firstGemini.percentage, `Gemini model ${k} percentage mismatch`);
        assert.equal(m.resetTime, firstGemini.resetTime, `Gemini model ${k} resetTime mismatch`);
      }
      geminiPercentages.add(firstGemini.percentage);

      // All Claude models in this account must have identical percentage and resetTime
      const firstClaude = acc.quota.models[claudeKeys[0]]!;
      for (const k of claudeKeys) {
        const m = acc.quota.models[k]!;
        assert.equal(m.percentage, firstClaude.percentage, `Claude model ${k} percentage mismatch`);
        assert.equal(m.resetTime, firstClaude.resetTime, `Claude model ${k} resetTime mismatch`);
      }
      claudePercentages.add(firstClaude.percentage);

      // Check weekly quota groups
      const claudeWeekly = acc.quota.quota_groups?.find((g) => g.display_name === 'Claude Weekly Shared');
      const geminiWeekly = acc.quota.quota_groups?.find((g) => g.display_name === 'Gemini Weekly Shared');
      assert.ok(claudeWeekly, 'Missing Claude Weekly Shared');
      assert.ok(geminiWeekly, 'Missing Gemini Weekly Shared');
    }

    // Over 10 accounts with random_modern_mix, quotas should be randomized across accounts
    assert.ok(geminiPercentages.size > 1, 'Expected randomized Gemini percentages across accounts');
    assert.ok(claudePercentages.size > 1, 'Expected randomized Claude percentages across accounts');
  });

  it('supports custom min and max model count options when explicitly specified', () => {
    const accounts = AccountEmulationService.generateAccounts(5, 'balanced_pool', {
      minModelsPerAccount: 3,
      maxModelsPerAccount: 4,
    });
    assert.equal(accounts.length, 5);

    for (const acc of accounts) {
      const count = Object.keys(acc.quota.models).length;
      assert.ok(count >= 3 && count <= 4, `Expected 3..4 models, got ${count}`);
    }
  });

  it('correctly drains randomized models during simulation ticks', () => {
    AccountEmulationService.setEnabled(true);
    const [acc] = AccountEmulationService.generateAccounts(1, 'random_modern_mix');
    const firstModelKey = Object.keys(acc.quota.models)[0]!;
    const initialPct = acc.quota.models[firstModelKey]!.percentage;

    AccountEmulationService.applySimulationTick();

    const state = AccountEmulationService.getState();
    const updated = state.accounts.find((a) => a.id === acc.id);
    assert.ok(updated);
    const updatedPct = updated.quota.models[firstModelKey]!.percentage;
    assert.ok(updatedPct <= initialPct);
  });

  it('generates accounts with realistic @gmail.com emails and clean status reasons', () => {
    const accounts = AccountEmulationService.generateAccounts(5, 'balanced_pool');
    for (const acc of accounts) {
      assert.match(acc.email, /@gmail\.com$/);
      assert.ok(!acc.email.includes('@sim.mock'));
      if (acc.status_reason) {
        assert.ok(!acc.status_reason.includes('Emulated'));
        assert.ok(!acc.status_reason.includes('Simulated'));
      }
    }
  });

  it('sanitizes legacy emulated accounts on getState', () => {
    const legacyState = {
      enabled: true,
      tickIntervalSeconds: 5,
      accounts: [
        {
          id: 'emulated-legacy-1',
          name: 'Tester One',
          tier: 'Pro',
          email: 'tester.one.1234@sim.mock',
          provider: 'google',
          status: 'rate_limited',
          status_reason: 'RESOURCE_EXHAUSTED (Emulated quota exhaustion)',
          quota: {
            models: {},
            quota_groups: { gemini_pro: 0, gemini_flash: 0, claude: 0 },
            ai_credits: { credits: 0, reset_time: '2026-09-10' },
          },
          strategy: { type: 'rate_limited', drainStepPercent: 0, tickIntervalSeconds: 5 },
          created_at: Date.now(),
          last_used: Date.now(),
          is_active_ide: false,
          is_emulated: true,
        },
      ],
    };
    AccountEmulationService.saveState(legacyState as any);

    const state = AccountEmulationService.getState();
    assert.equal(state.accounts[0].email, 'tester.one.1234@gmail.com');
    assert.equal(state.accounts[0].status_reason, 'RESOURCE_EXHAUSTED');
    assert.equal(Object.keys(state.accounts[0].quota.models).length, SIMULATION_MODERN_MODELS.length);
    assert.ok(state.accounts[0].quota.quota_groups?.some((g) => g.display_name === 'Claude Weekly Shared'));
    assert.ok(state.accounts[0].quota.quota_groups?.some((g) => g.display_name === 'Gemini Weekly Shared'));
  });
});
