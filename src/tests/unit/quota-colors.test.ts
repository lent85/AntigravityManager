import { describe, expect, it } from 'vitest';
import {
  detectModelGeneration,
  getModelQuotaBarColorClass,
  getModelQuotaTextColorClass,
  getQuotaBarColorClassByPercentage,
  getQuotaTextColorClassByPercentage,
  groupModelsByGeneration,
} from '@/modules/cloud-account/components/quota-colors';
import type { CloudQuotaModelInfo } from '@/modules/cloud-account/types';

function createQuota(percentage: number): CloudQuotaModelInfo {
  return {
    percentage,
    resetTime: '2026-10-12T12:00:00.000Z',
  };
}

describe('quota-colors: model generation detection', () => {
  it('detects Gemini 4.0 models correctly', () => {
    expect(detectModelGeneration('models/gemini-4.0-flash')).toBe('gemini-4.0');
    expect(detectModelGeneration('gemini-4.0-pro')).toBe('gemini-4.0');
    expect(detectModelGeneration('gemini-4-flash')).toBe('gemini-4.0');
  });

  it('detects Gemini 3.8 models correctly', () => {
    expect(detectModelGeneration('models/gemini-3.8-flash')).toBe('gemini-3.8');
    expect(detectModelGeneration('gemini-3.8-pro')).toBe('gemini-3.8');
    expect(detectModelGeneration('gemini-3.8')).toBe('gemini-3.8');
  });

  it('detects Gemini 3.7 models correctly', () => {
    expect(detectModelGeneration('gemini-3.7-flash')).toBe('gemini-3.7');
    expect(detectModelGeneration('gemini-3.7-flash-high')).toBe('gemini-3.7');
  });

  it('detects Gemini 3.6 models correctly', () => {
    expect(detectModelGeneration('gemini-3.6-flash')).toBe('gemini-3.6');
    expect(detectModelGeneration('gemini-3.6-flash-low')).toBe('gemini-3.6');
  });

  it('detects Gemini 3.1 Pro models correctly', () => {
    expect(detectModelGeneration('gemini-3.1-pro-high')).toBe('gemini-3.1-pro');
    expect(detectModelGeneration('gemini-pro-agent')).toBe('gemini-3.1-pro');
    expect(detectModelGeneration('gemini-3-pro')).toBe('gemini-3.1-pro');
  });

  it('detects Gemini 3.5 & Flash models correctly', () => {
    expect(detectModelGeneration('gemini-3.5-flash')).toBe('gemini-3.5-flash');
    expect(detectModelGeneration('gemini-3-flash')).toBe('gemini-3.5-flash');
  });

  it('detects Claude models correctly with specific families', () => {
    expect(detectModelGeneration('claude-sonnet-4-6')).toBe('claude-sonnet');
    expect(detectModelGeneration('claude-opus-4-6-thinking')).toBe('claude-opus');
    expect(detectModelGeneration('claude-haiku-4-5')).toBe('claude-haiku');
    expect(detectModelGeneration('claude-unknown')).toBe('claude');
  });

  it('detects Flash Lite, Image, and GPT models correctly', () => {
    expect(detectModelGeneration('gemini-flash-lite')).toBe('gemini-flash-lite');
    expect(detectModelGeneration('gemini-flashlite-high')).toBe('gemini-flash-lite');
    expect(detectModelGeneration('gemini-image-gen')).toBe('gemini-image');
    expect(detectModelGeneration('gpt-oss-120b')).toBe('gpt');
  });

  it('uses secondaryText when modelId is generic', () => {
    expect(detectModelGeneration('custom-id', 'Claude 3.7 Sonnet')).toBe('claude-sonnet');
    expect(detectModelGeneration('unknown-model', 'Gemini Flash Lite')).toBe('gemini-flash-lite');
  });
});

describe('quota-colors: bar color depth and intensity', () => {
  it('returns vibrant/deep color with glow when quota is high (>= 80%)', () => {
    const bar40 = getModelQuotaBarColorClass('gemini-4.0-flash', 100);
    expect(bar40).toContain('purple-600');
    expect(bar40).toContain('shadow-[');

    const bar38 = getModelQuotaBarColorClass('gemini-3.8-flash', 90);
    expect(bar38).toContain('blue-600');
    expect(bar38).toContain('shadow-[');

    const bar37 = getModelQuotaBarColorClass('gemini-3.7-flash', 85);
    expect(bar37).toContain('emerald-500');
    expect(bar37).toContain('shadow-[');

    const bar36 = getModelQuotaBarColorClass('gemini-3.6-flash', 80);
    expect(bar36).toContain('cyan-500');
    expect(bar36).toContain('shadow-[');

    const barSonnet = getModelQuotaBarColorClass('claude-sonnet-4-6', 90);
    expect(barSonnet).toContain('amber-500');
    expect(barSonnet).toContain('orange-500');

    const barOpus = getModelQuotaBarColorClass('claude-opus-4-6', 90);
    expect(barOpus).toContain('violet-600');

    const barHaiku = getModelQuotaBarColorClass('claude-haiku-4-5', 90);
    expect(barHaiku).toContain('teal-500');

    const barLite = getModelQuotaBarColorClass('gemini-flash-lite', 90);
    expect(barLite).toContain('lime-500');

    const barImage = getModelQuotaBarColorClass('gemini-image', 90);
    expect(barImage).toContain('pink-500');
  });

  it('returns medium intensity color when quota is 50-79%', () => {
    const bar38 = getModelQuotaBarColorClass('gemini-3.8-flash', 65);
    expect(bar38).toContain('blue-500');

    const bar37 = getModelQuotaBarColorClass('gemini-3.7-flash', 55);
    expect(bar37).toContain('emerald-500');

    const barSonnet = getModelQuotaBarColorClass('claude-sonnet-4-6', 65);
    expect(barSonnet).toContain('amber-500');
  });

  it('returns lighter/softer color when quota is low (20-49%)', () => {
    const bar38 = getModelQuotaBarColorClass('gemini-3.8-flash', 35);
    expect(bar38).toContain('blue-400');

    const bar37 = getModelQuotaBarColorClass('gemini-3.7-flash', 25);
    expect(bar37).toContain('emerald-400');
  });

  it('returns warning rose/red when quota is critical (< 20%)', () => {
    const barCritical = getModelQuotaBarColorClass('gemini-3.8-flash', 15);
    expect(barCritical).toContain('rose-500');
    expect(barCritical).toContain('red-600');
  });
});

describe('quota-colors: groupModelsByGeneration', () => {
  it('separates models into distinct generation groups in priority order', () => {
    const models: Record<string, CloudQuotaModelInfo> = {
      'gemini-3.6-flash-low': createQuota(30),
      'gemini-3.7-flash-high': createQuota(75),
      'gemini-3.8-flash': createQuota(90),
      'gemini-4.0-flash': createQuota(100),
      'claude-sonnet-4-6': createQuota(85),
      'gemini-3.1-pro-high': createQuota(40),
    };

    const groups = groupModelsByGeneration(models);

    expect(groups.map((g) => g.key)).toEqual([
      'gemini-4.0',
      'gemini-3.8',
      'gemini-3.7',
      'gemini-3.6',
      'gemini-3.1-pro',
      'claude-sonnet',
    ]);

    expect(groups[0].label).toBe('Gemini 4.0');
    expect(groups[0].models[0][0]).toBe('gemini-4.0-flash');
    expect(groups[0].models[0][1].percentage).toBe(100);

    expect(groups[1].label).toBe('Gemini 3.8');
    expect(groups[2].label).toBe('Gemini 3.7');
    expect(groups[3].label).toBe('Gemini 3.6');
  });

  it('sorts models inside each group by remaining percentage descending', () => {
    const models: Record<string, CloudQuotaModelInfo> = {
      'gemini-3.7-flash-low': createQuota(20),
      'gemini-3.7-flash-high': createQuota(95),
      'gemini-3.7-flash-medium': createQuota(50),
    };

    const groups = groupModelsByGeneration(models);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('gemini-3.7');
    expect(groups[0].models.map(([name]) => name)).toEqual([
      'gemini-3.7-flash-high',
      'gemini-3.7-flash-medium',
      'gemini-3.7-flash-low',
    ]);
  });

  it('filters out legacy gemini-1 and gemini-2 models', () => {
    const models: Record<string, CloudQuotaModelInfo> = {
      'gemini-1.5-pro': createQuota(50),
      'gemini-2.0-flash': createQuota(60),
      'gemini-3.7-flash': createQuota(80),
    };

    const groups = groupModelsByGeneration(models);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('gemini-3.7');
  });
});
