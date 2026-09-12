import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGeminiModel,
  isClaudeModel,
  validateGroupQuotaConsistency,
  createWeeklyQuotaGroups,
  applyDrainStep,
} from '@/modules/cloud-account/domain/quota-group-engine';

describe('quota-group-engine (Pure Domain)', () => {
  it('correctly classifies Gemini and Claude model identifiers', () => {
    assert.equal(isGeminiModel('gemini-3.8-flash-high'), true);
    assert.equal(isGeminiModel('gemini-3.1-pro'), true);
    assert.equal(isGeminiModel('claude-sonnet-4-6'), false);

    assert.equal(isClaudeModel('claude-sonnet-4-6'), true);
    assert.equal(isClaudeModel('claude-opus-4-6'), true);
    assert.equal(isClaudeModel('gemini-3.5-flash'), false);
  });

  it('validates INV-2: detects percentage or resetTime mismatch within model group', () => {
    const consistentModels = {
      'gemini-3.8-flash-high': { percentage: 85, resetTime: '2026-10-01T12:00:00Z', display_name: 'G1' },
      'gemini-3.1-pro': { percentage: 85, resetTime: '2026-10-01T12:00:00Z', display_name: 'G2' },
      'claude-sonnet-4-6': { percentage: 90, resetTime: '2026-10-01T14:00:00Z', display_name: 'C1' },
      'claude-opus-4-6': { percentage: 90, resetTime: '2026-10-01T14:00:00Z', display_name: 'C2' },
    };

    const validResult = validateGroupQuotaConsistency(consistentModels);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.violations.length, 0);

    const inconsistentModels = {
      'gemini-3.8-flash-high': { percentage: 85, resetTime: '2026-10-01T12:00:00Z', display_name: 'G1' },
      'gemini-3.1-pro': { percentage: 70, resetTime: '2026-10-01T12:00:00Z', display_name: 'G2' }, // MISMATCH
      'claude-sonnet-4-6': { percentage: 90, resetTime: '2026-10-01T14:00:00Z', display_name: 'C1' },
    };

    const invalidResult = validateGroupQuotaConsistency(inconsistentModels);
    assert.equal(invalidResult.valid, false);
    assert.ok(invalidResult.violations.some((v) => v.includes('Gemini model gemini-3.1-pro')));
  });

  it('creates canonical Weekly Shared quota groups with expected bucket format', () => {
    const groups = createWeeklyQuotaGroups(0.85, 0.90, '2026-10-08T12:00:00Z');
    assert.equal(groups.length, 2);

    const claudeGroup = groups.find((g) => g.display_name === 'Claude Weekly Shared');
    const geminiGroup = groups.find((g) => g.display_name === 'Gemini Weekly Shared');

    assert.ok(claudeGroup);
    assert.ok(geminiGroup);
    assert.equal(claudeGroup.buckets[0].remaining_fraction, 0.90);
    assert.equal(geminiGroup.buckets[0].remaining_fraction, 0.85);
  });

  it('applies drain step deterministically to models and weekly buckets', () => {
    const initialModels = {
      'gemini-3.8-flash-high': { percentage: 10, resetTime: '2026-10-01T12:00:00Z', display_name: 'G1' },
      'claude-sonnet-4-6': { percentage: 15, resetTime: '2026-10-01T12:00:00Z', display_name: 'C1' },
    };
    const initialGroups = createWeeklyQuotaGroups(0.50, 0.50, '2026-10-08T12:00:00Z');

    const result = applyDrainStep(initialModels, initialGroups, 5);
    assert.equal(result.updatedModels['gemini-3.8-flash-high'].percentage, 5);
    assert.equal(result.updatedModels['claude-sonnet-4-6'].percentage, 10);
    assert.equal(result.allDepleted, false);

    // Drain again with 15% (should hit 0 and mark allDepleted)
    const depletedResult = applyDrainStep(result.updatedModels, result.updatedGroups, 15);
    assert.equal(depletedResult.updatedModels['gemini-3.8-flash-high'].percentage, 0);
    assert.equal(depletedResult.updatedModels['claude-sonnet-4-6'].percentage, 0);
    assert.equal(depletedResult.allDepleted, true);
  });
});
