import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AccountEmulationService } from '@/modules/cloud-account/emulation/AccountEmulationService';
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
      assert.ok(acc.quota.models['gemini-2.5-pro']);
      assert.ok(acc.quota.models['gemini-2.5-flash']);
      assert.ok(acc.quota.models['claude-3-5-sonnet']);
      assert.ok(acc.quota.quota_groups);
    }
  });

  it('generates auto_switch_test_bench with a low quota candidate and a rate-limited candidate', () => {
    const accounts = AccountEmulationService.generateAccounts(3, 'auto_switch_test_bench');
    assert.equal(accounts.length, 3);
    // First account is critically low (<5%)
    assert.ok(accounts[0].quota.models['gemini-2.5-pro'].percentage <= 5);
    // Second account is rate-limited
    assert.equal(accounts[1].status, 'rate_limited');
    // Third account is healthy backup
    assert.ok(accounts[2].quota.models['gemini-2.5-pro'].percentage > 50);
  });

  it('applies linear drain simulation tick', () => {
    AccountEmulationService.setEnabled(true);
    const [acc] = AccountEmulationService.generateAccounts(1, 'drain_demo');
    const initialSonnet = acc.quota.models['claude-3-5-sonnet'].percentage;

    AccountEmulationService.applySimulationTick();

    const state = AccountEmulationService.getState();
    const updated = state.accounts.find((a) => a.id === acc.id);
    assert.ok(updated);
    assert.equal(
      updated.quota.models['claude-3-5-sonnet'].percentage,
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

  it('generates accounts with random modern models and variable model quantities', () => {
    const accounts = AccountEmulationService.generateAccounts(10, 'random_modern_mix');
    assert.equal(accounts.length, 10);

    const modelCounts = new Set<number>();
    const observedModelIds = new Set<string>();

    for (const acc of accounts) {
      const keys = Object.keys(acc.quota.models);
      modelCounts.add(keys.length);
      for (const k of keys) {
        observedModelIds.add(k);
      }

      // Quantity must be within default 2 to 6
      assert.ok(keys.length >= 2 && keys.length <= 6, `Expected 2..6 models, got ${keys.length}`);

      // Each model should have a valid percentage and reset time
      for (const modelInfo of Object.values(acc.quota.models)) {
        assert.ok(modelInfo.percentage >= 0 && modelInfo.percentage <= 100);
        assert.ok(modelInfo.resetTime.length > 0);
        assert.ok(modelInfo.display_name && modelInfo.display_name.length > 0);
      }
    }

    // Over 10 accounts, we should observe multiple distinct model counts (variable count)
    assert.ok(modelCounts.size > 1, `Expected variable model counts, got: ${Array.from(modelCounts).join(',')}`);

    // And we should observe newer modern models
    const hasModernGemini = Array.from(observedModelIds).some((id) => id.startsWith('gemini-3'));
    const hasModernClaude = Array.from(observedModelIds).some((id) => id.includes('4-6') || id.includes('3-7'));
    assert.ok(hasModernGemini || hasModernClaude, 'Expected modern Gemini 3.x or Claude 4.x/3.7 models in pool');
  });

  it('supports custom min and max model count options with randomizeModels', () => {
    const accounts = AccountEmulationService.generateAccounts(5, 'balanced_pool', {
      randomizeModels: true,
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
});
