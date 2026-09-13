import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  extractEmailFromJwt,
  matchAccountFromCredentialToken,
} from '@/modules/cloud-account/services/accountTokenMatcher';
import type { CloudAccount } from '@/modules/cloud-account/types';
import { GoogleAPIService } from '@/modules/cloud-account/services/GoogleAPIService';
import { CloudAccountRepo } from '@/modules/cloud-account/persistence/cloudHandler';

vi.mock('@/shared/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('@/modules/cloud-account/services/GoogleAPIService', () => ({
  GoogleAPIService: {
    getUserInfo: vi.fn(),
    refreshAccessToken: vi.fn(),
  },
}));

vi.mock('@/modules/cloud-account/persistence/cloudHandler', () => ({
  CloudAccountRepo: {
    updateToken: vi.fn(),
  },
}));

function createMockAccount(id: string, email: string, refreshToken: string, accessToken: string): CloudAccount {
  return {
    id,
    provider: 'google',
    email,
    name: email.split('@')[0],
    created_at: 1000,
    last_used: 1000,
    status: 'active',
    token: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      expiry_timestamp: 4600,
      token_type: 'Bearer',
      email,
    },
  };
}

function makeMockJwt(email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ email, sub: '12345' })).toString('base64');
  return `${header}.${payload}.mock-signature`;
}

describe('extractEmailFromJwt', () => {
  it('extracts and normalizes email from a valid JWT', () => {
    const jwt = makeMockJwt('Test.User@Example.COM');
    expect(extractEmailFromJwt(jwt)).toBe('test.user@example.com');
  });

  it('returns undefined for invalid or malformed tokens', () => {
    expect(extractEmailFromJwt(undefined)).toBeUndefined();
    expect(extractEmailFromJwt('')).toBeUndefined();
    expect(extractEmailFromJwt('not-a-jwt')).toBeUndefined();
    expect(extractEmailFromJwt('invalid.base64.signature')).toBeUndefined();
  });
});

describe('matchAccountFromCredentialToken', () => {
  const account1 = createMockAccount('acc-1', 'alice@gmail.com', 'refresh-1', 'access-1');
  const account2 = createMockAccount('acc-2', 'bob@gmail.com', 'refresh-2', 'access-2');
  const accounts = [account1, account2];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Tier 1: matches by exact refresh_token', async () => {
    const result = await matchAccountFromCredentialToken(
      { refreshToken: 'refresh-1', accessToken: 'some-other-access' },
      accounts,
    );
    expect(result?.id).toBe('acc-1');
  });

  it('Tier 2: matches by exact access_token when refresh_token does not match', async () => {
    const result = await matchAccountFromCredentialToken(
      { refreshToken: 'unknown-refresh', accessToken: 'access-2' },
      accounts,
    );
    expect(result?.id).toBe('acc-2');
  });

  it('Tier 3: matches by JWT idToken email when raw tokens do not match', async () => {
    const idToken = makeMockJwt('alice@gmail.com');
    const result = await matchAccountFromCredentialToken(
      { refreshToken: 'different-refresh', accessToken: 'expired-access', idToken },
      accounts,
    );
    expect(result?.id).toBe('acc-1');
  });

  it('Tier 4: matches by calling GoogleAPIService.getUserInfo with accessToken', async () => {
    vi.mocked(GoogleAPIService.getUserInfo).mockResolvedValueOnce({
      id: 'sub-2',
      email: 'bob@gmail.com',
    } as any);

    const result = await matchAccountFromCredentialToken(
      { refreshToken: 'different-refresh', accessToken: 'valid-unrecognized-access' },
      accounts,
    );
    expect(result?.id).toBe('acc-2');
    expect(GoogleAPIService.getUserInfo).toHaveBeenCalledWith('valid-unrecognized-access');
  });

  it('Tier 5: matches by refreshing token with Google OAuth and updates repo', async () => {
    vi.mocked(GoogleAPIService.getUserInfo).mockRejectedValueOnce(new Error('401 Unauthorized'));
    vi.mocked(GoogleAPIService.refreshAccessToken).mockResolvedValueOnce({
      access_token: 'new-access-1',
      refresh_token: 'new-refresh-1',
      expires_in: 3600,
      token_type: 'Bearer',
      id_token: makeMockJwt('alice@gmail.com'),
    });

    const result = await matchAccountFromCredentialToken(
      { refreshToken: 'rotated-refresh-1', accessToken: 'expired-access-1' },
      accounts,
      { updateRepoOnRefresh: true },
    );
    expect(result?.id).toBe('acc-1');
    expect(CloudAccountRepo.updateToken).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({
        access_token: 'new-access-1',
        refresh_token: 'new-refresh-1',
      }),
    );
  });

  it('returns undefined when all tiers fail to match', async () => {
    vi.mocked(GoogleAPIService.getUserInfo).mockRejectedValueOnce(new Error('Network error'));
    vi.mocked(GoogleAPIService.refreshAccessToken).mockRejectedValueOnce(new Error('Revoked token'));

    const result = await matchAccountFromCredentialToken(
      { refreshToken: 'revoked-token', accessToken: 'dead-access' },
      accounts,
    );
    expect(result).toBeUndefined();
  });
});
