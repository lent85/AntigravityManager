import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import type { CloudAccount } from '@/modules/cloud-account/types';
import {
  calculateProvidersGlobalQuota,
  isClaudeModel,
  isClaudeWeeklyItem,
  isGeminiModel,
  isGeminiWeeklyItem,
} from '@/modules/cloud-account/utils/quota-provider-summary';
import { CloudAccountListSummary } from '@/modules/cloud-account/components/CloudAccountListSummary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

function makeMockAccount(
  id: string,
  email: string,
  quota?: CloudAccount['quota'],
): CloudAccount {
  return {
    id,
    email,
    created_at: 1000,
    last_used: 1000,
    is_active: true,
    status: 'active',
    provider: 'google',
    token: {
      access_token: `access-${id}`,
      refresh_token: `refresh-${id}`,
      expires_in: 3600,
      expiry_timestamp: Date.now() + 3600000,
      token_type: 'Bearer',
    },
    quota,
  };
}

describe('quota-provider-summary utils', () => {
  it('correctly classifies Gemini models and ignores legacy models', () => {
    expect(isGeminiModel('models/gemini-2.5-pro')).toBe(true);
    expect(isGeminiModel('gemini-3.7-flash')).toBe(true);
    expect(isGeminiModel('gemini-1.5-pro')).toBe(false); // Legacy
    expect(isGeminiModel('claude-3-7-sonnet')).toBe(false);
  });

  it('correctly classifies Claude models', () => {
    expect(isClaudeModel('models/claude-3-7-sonnet')).toBe(true);
    expect(isClaudeModel('claude-sonnet-4-6')).toBe(true);
    expect(isClaudeModel('gemini-2.5-pro')).toBe(false);
  });

  it('correctly classifies Gemini and Claude weekly items', () => {
    const geminiItem = {
      id: 'g1',
      groupName: 'Gemini Weekly Shared',
      bucketLabel: 'Weekly requests',
      percentage: 80,
      resetTime: '2026-10-01T00:00:00Z',
      bucket: {
        bucket_id: 'gemini-weekly',
        window: 'WEEKLY',
        remaining_fraction: 0.8,
        reset_time: '2026-10-01T00:00:00Z',
      },
    };

    const claudeItem = {
      id: 'c1',
      groupName: 'Claude Weekly Shared',
      bucketLabel: 'Weekly requests',
      percentage: 95,
      resetTime: '2026-10-01T00:00:00Z',
      bucket: {
        bucket_id: 'claude-weekly',
        window: 'WEEKLY',
        remaining_fraction: 0.95,
        reset_time: '2026-10-01T00:00:00Z',
      },
    };

    expect(isGeminiWeeklyItem(geminiItem)).toBe(true);
    expect(isClaudeWeeklyItem(geminiItem)).toBe(false);

    expect(isGeminiWeeklyItem(claudeItem)).toBe(false);
    expect(isClaudeWeeklyItem(claudeItem)).toBe(true);
  });

  it('returns nulls for empty accounts', () => {
    const result = calculateProvidersGlobalQuota([]);
    expect(result.gemini.quota5h).toBeNull();
    expect(result.gemini.quotaWeekly).toBeNull();
    expect(result.claude.quota5h).toBeNull();
    expect(result.claude.quotaWeekly).toBeNull();
  });

  it('calculates average 5h and weekly quota for accounts with Gemini and Claude', () => {
    const accounts: CloudAccount[] = [
      makeMockAccount('acc-1', 'user1@example.com', {
        models: {
          'gemini-2.5-flash': { percentage: 80, resetTime: '2026-10-01T00:00:00Z' },
          'claude-3-7-sonnet': { percentage: 90, resetTime: '2026-10-01T00:00:00Z' },
        },
        quota_groups: [
          {
            display_name: 'Gemini Weekly Shared',
            buckets: [
              {
                bucket_id: 'gemini-weekly',
                window: 'WEEKLY',
                remaining_fraction: 0.7,
                reset_time: '2026-10-01T00:00:00Z',
              },
            ],
          },
          {
            display_name: 'Claude Weekly Shared',
            buckets: [
              {
                bucket_id: 'claude-weekly',
                window: 'WEEKLY',
                remaining_fraction: 0.85,
                reset_time: '2026-10-01T00:00:00Z',
              },
            ],
          },
        ],
      }),
      makeMockAccount('acc-2', 'user2@example.com', {
        models: {
          'gemini-2.5-flash': { percentage: 60, resetTime: '2026-10-01T00:00:00Z' },
          'claude-3-7-sonnet': { percentage: 70, resetTime: '2026-10-01T00:00:00Z' },
        },
        quota_groups: [
          {
            display_name: 'Gemini Weekly Shared',
            buckets: [
              {
                bucket_id: 'gemini-weekly',
                window: 'WEEKLY',
                remaining_fraction: 0.9,
                reset_time: '2026-10-01T00:00:00Z',
              },
            ],
          },
          {
            display_name: 'Claude Weekly Shared',
            buckets: [
              {
                bucket_id: 'claude-weekly',
                window: 'WEEKLY',
                remaining_fraction: 0.75,
                reset_time: '2026-10-01T00:00:00Z',
              },
            ],
          },
        ],
      }),
    ];

    const result = calculateProvidersGlobalQuota(accounts);

    // Gemini 5h: (80 + 60) / 2 = 70
    expect(result.gemini.quota5h).toBe(70);
    expect(result.gemini.status5h).toBe('high');

    // Gemini Weekly: (70 + 90) / 2 = 80
    expect(result.gemini.quotaWeekly).toBe(80);
    expect(result.gemini.statusWeekly).toBe('high');

    // Claude 5h: (90 + 70) / 2 = 80
    expect(result.claude.quota5h).toBe(80);
    expect(result.claude.status5h).toBe('high');

    // Claude Weekly: (85 + 75) / 2 = 80
    expect(result.claude.quotaWeekly).toBe(80);
    expect(result.claude.statusWeekly).toBe('high');
  });

  it('filters hidden models according to modelVisibility', () => {
    const accounts: CloudAccount[] = [
      makeMockAccount('acc-1', 'user1@example.com', {
        models: {
          'gemini-2.5-flash': { percentage: 20, resetTime: '2026-10-01T00:00:00Z' },
          'gemini-3.7-flash': { percentage: 90, resetTime: '2026-10-01T00:00:00Z' },
        },
      }),
    ];

    // If gemini-2.5-flash is hidden, only 3.7-flash (90%) counts
    const result = calculateProvidersGlobalQuota(accounts, { 'gemini-2.5-flash': false });
    expect(result.gemini.quota5h).toBe(90);
  });
});

describe('CloudAccountListSummary component', () => {
  it('renders Gemini and Claude cards with 5h and Wk metrics', () => {
    render(
      createElement(CloudAccountListSummary, {
        totalAccounts: 10,
        activeAccounts: 3,
        rateLimitedAccounts: 0,
        overallQuotaPercentage: 85,
        effectiveQuotaStatus: 'high',
        geminiQuota: {
          quota5h: 89.8,
          status5h: 'high',
          quotaWeekly: 95.2,
          statusWeekly: 'high',
        },
        claudeQuota: {
          quota5h: 75.0,
          status5h: 'high',
          quotaWeekly: 60.5,
          statusWeekly: 'high',
        },
      }),
    );

    expect(screen.getByText('Gemini')).toBeTruthy();
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('89.8%')).toBeTruthy();
    expect(screen.getByText('95.2%')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('60.5%')).toBeTruthy();
  });

  it('renders fallback global quota when provider quotas are null', () => {
    render(
      createElement(CloudAccountListSummary, {
        totalAccounts: 5,
        activeAccounts: 2,
        rateLimitedAccounts: 0,
        overallQuotaPercentage: 89.8,
        effectiveQuotaStatus: 'high',
        geminiQuota: null,
        claudeQuota: null,
      }),
    );

    expect(screen.getByText('cloud.globalQuota')).toBeTruthy();
    expect(screen.getByText('89.8%')).toBeTruthy();
    expect(screen.queryByText('Gemini')).toBeNull();
    expect(screen.queryByText('Claude')).toBeNull();
  });
});
