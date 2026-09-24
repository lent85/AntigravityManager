import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ProxyGuard } from '../../modules/proxy-gateway/server/guards/proxy.guard';
import {
  resolveConfiguredApiKeys,
  getClientInfo,
} from '../../modules/proxy-gateway/server/shared/services/request-usage-context';
import { proxyUsageStore } from '../../modules/proxy-gateway/server/shared/services/proxy-usage.store';
import type { ProxyConfig } from '../../modules/config/types';

// Mock openCodeCredentialService
const credentialMocks = vi.hoisted(() => ({
  matches: vi.fn(),
}));

vi.mock('@/modules/proxy-gateway/opencode-sync/opencode-credentials', () => ({
  openCodeCredentialService: credentialMocks,
}));

let currentMockConfig: Partial<ProxyConfig> = {};

vi.mock('@/server/server-config', () => ({
  getServerConfig: () => currentMockConfig,
}));

function createContext(url: string, headers: Record<string, string> = {}): { context: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = {
    headers,
    ip: '127.0.0.1',
    url,
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as ExecutionContext;
  return { context, req };
}

describe('Proxy Multiple API Keys & Usage Tracking', () => {
  beforeEach(() => {
    credentialMocks.matches.mockReset();
    credentialMocks.matches.mockReturnValue(false);
    currentMockConfig = {};
    proxyUsageStore.clear();
  });

  describe('resolveConfiguredApiKeys', () => {
    it('returns empty array when config has no keys', () => {
      expect(resolveConfiguredApiKeys({} as ProxyConfig)).toEqual([]);
      expect(resolveConfiguredApiKeys({ api_key: '', api_keys: [] } as unknown as ProxyConfig)).toEqual([]);
    });

    it('falls back to single api_key as Default Client when api_keys is empty', () => {
      const keys = resolveConfiguredApiKeys({ api_key: 'sk-legacy-key' } as unknown as ProxyConfig);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toEqual({
        id: 'default',
        name: 'Default Client',
        key: 'sk-legacy-key',
        created_at: 0,
        enabled: true,
      });
    });

    it('uses configured api_keys array when present', () => {
      const keys = resolveConfiguredApiKeys({
        api_key: 'sk-legacy-key',
        api_keys: [
          { id: 'k1', name: 'Cursor IDE', key: 'sk-cursor-123', created_at: Date.now(), enabled: true },
          { id: 'k2', name: 'Claude Code', key: 'sk-claude-456', created_at: Date.now(), enabled: false },
        ],
      } as unknown as ProxyConfig);
      expect(keys).toHaveLength(2);
      expect(keys[0]?.name).toBe('Cursor IDE');
      expect(keys[1]?.name).toBe('Claude Code');
    });
  });

  describe('ProxyGuard Multi-Key Authentication', () => {
    it('allows open access when no keys are configured', () => {
      currentMockConfig = {};
      const guard = new ProxyGuard();
      const { context, req } = createContext('/v1/chat/completions');

      expect(guard.canActivate(context)).toBe(true);
      expect(getClientInfo(req)).toEqual({
        keyId: 'open',
        keyName: 'Open Access (No Key)',
      });
    });

    it('authenticates with named client key and attaches client info', () => {
      currentMockConfig = {
        api_keys: [
          { id: 'cursor-key', name: 'Cursor IDE', key: 'sk-cursor-app-token', created_at: Date.now(), enabled: true },
          { id: 'web-key', name: 'Web Portal', key: 'sk-web-portal-token', created_at: Date.now(), enabled: true },
        ],
      };
      const guard = new ProxyGuard();
      const { context, req } = createContext('/v1/chat/completions', {
        authorization: 'Bearer sk-cursor-app-token',
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(getClientInfo(req)).toEqual({
        keyId: 'cursor-key',
        keyName: 'Cursor IDE',
      });
    });

    it('rejects request when using a disabled client key', () => {
      currentMockConfig = {
        api_keys: [
          { id: 'disabled-key', name: 'Old Client', key: 'sk-old-token', created_at: Date.now(), enabled: false },
        ],
      };
      const guard = new ProxyGuard();
      const { context } = createContext('/v1/chat/completions', {
        authorization: 'Bearer sk-old-token',
      });

      try {
        guard.canActivate(context);
        expect.fail('Should have thrown UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const unauth = err as UnauthorizedException;
        expect(unauth.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        const response = unauth.getResponse() as Record<string, unknown>;
        expect(JSON.stringify(response)).toContain('disabled');
      }
    });

    it('rejects request when token is invalid or missing', () => {
      currentMockConfig = {
        api_keys: [
          { id: 'client-key', name: 'Client App', key: 'sk-secret-token', created_at: Date.now(), enabled: true },
        ],
      };
      const guard = new ProxyGuard();
      const { context } = createContext('/v1/chat/completions', {
        authorization: 'Bearer sk-wrong-token',
      });

      try {
        guard.canActivate(context);
        expect.fail('Should have thrown UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const unauth = err as UnauthorizedException;
        expect(unauth.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        const response = unauth.getResponse() as Record<string, unknown>;
        expect(JSON.stringify(response)).toContain('failed');
      }
    });

    it('authenticates openCode client when openCodeCredentialService matches', () => {
      credentialMocks.matches.mockReturnValue(true);
      currentMockConfig = {
        api_keys: [
          { id: 'other-key', name: 'Other', key: 'sk-other', created_at: Date.now(), enabled: true },
        ],
      };
      const guard = new ProxyGuard();
      const { context, req } = createContext('/v1/messages', {
        authorization: 'Bearer opencode-token',
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(getClientInfo(req)).toEqual({
        keyId: 'opencode',
        keyName: 'OpenCode Client',
      });
    });
  });

  describe('ProxyUsageStore Aggregation & Queries', () => {
    it('records and summarizes multi-client usage correctly', async () => {
      // Record requests from Client A
      proxyUsageStore.record({
        keyId: 'client-a',
        keyName: 'Cursor IDE',
        protocol: 'openai',
        endpoint: '/v1/chat/completions',
        model: 'gemini-3-flash',
        statusCode: 200,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.0001,
        durationMs: 320,
      });

      // Record request from Client B
      proxyUsageStore.record({
        keyId: 'client-b',
        keyName: 'OpenCode',
        protocol: 'anthropic',
        endpoint: '/v1/messages',
        model: 'claude-sonnet-4-6-thinking',
        statusCode: 200,
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700,
        cost: 0.005,
        durationMs: 1200,
      });

      // Record error request from Client A
      proxyUsageStore.record({
        keyId: 'client-a',
        keyName: 'Cursor IDE',
        protocol: 'openai',
        endpoint: '/v1/chat/completions',
        model: 'gemini-3-flash',
        statusCode: 429,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        durationMs: 15,
        errorMessage: 'Quota exhausted',
      });

      const stats = await proxyUsageStore.getStats({ timeRange: 'all' });

      // Summary checks
      expect(stats.summary.totalRequests).toBe(3);
      expect(stats.summary.successRequests).toBe(2);
      expect(stats.summary.failedRequests).toBe(1);
      expect(stats.summary.promptTokens).toBe(600);
      expect(stats.summary.completionTokens).toBe(250);
      expect(stats.summary.totalTokens).toBe(850);
      expect(stats.summary.estimatedCost).toBeCloseTo(0.0051, 4);

      // Client breakdown checks
      expect(stats.clientBreakdown).toHaveLength(2);
      const cursorBreakdown = stats.clientBreakdown.find((c) => c.keyId === 'client-a');
      expect(cursorBreakdown).toBeDefined();
      expect(cursorBreakdown?.keyName).toBe('Cursor IDE');
      expect(cursorBreakdown?.requests).toBe(2);
      expect(cursorBreakdown?.errors).toBe(1);
      expect(cursorBreakdown?.tokens).toBe(150);

      const openCodeBreakdown = stats.clientBreakdown.find((c) => c.keyId === 'client-b');
      expect(openCodeBreakdown).toBeDefined();
      expect(openCodeBreakdown?.keyName).toBe('OpenCode');
      expect(openCodeBreakdown?.requests).toBe(1);
      expect(openCodeBreakdown?.tokens).toBe(700);

      // Model breakdown checks
      expect(stats.modelBreakdown).toHaveLength(2);
      const geminiModel = stats.modelBreakdown.find((m) => m.model === 'gemini-3-flash');
      expect(geminiModel?.requests).toBe(2);
      const claudeModel = stats.modelBreakdown.find((m) => m.model === 'claude-sonnet-4-6-thinking');
      expect(claudeModel?.requests).toBe(1);

      // Access logs query
      const logsResult = await proxyUsageStore.getLogs({ limit: 10 });
      expect(logsResult.total).toBe(3);
      expect(logsResult.logs).toHaveLength(3);

      // Filter logs by client
      const clientALogs = await proxyUsageStore.getLogs({ keyId: 'client-a' });
      expect(clientALogs.total).toBe(2);

      // Filter logs by error
      const errorLogs = await proxyUsageStore.getLogs({ limit: 10 });
      const errorEntry = errorLogs.logs.find((l) => l.statusCode === 429);
      expect(errorEntry?.errorMessage).toBe('Quota exhausted');
    });

    it('clears records correctly', async () => {
      proxyUsageStore.record({
        keyId: 'test',
        keyName: 'Test',
        protocol: 'openai',
        endpoint: '/v1/models',
        statusCode: 200,
        durationMs: 50,
      });

      const initialStats = await proxyUsageStore.getStats({ timeRange: 'all' });
      expect(initialStats.summary.totalRequests).toBe(1);

      proxyUsageStore.clear();

      const clearedStats = await proxyUsageStore.getStats({ timeRange: 'all' });
      expect(clearedStats.summary.totalRequests).toBe(0);
      const clearedLogs = await proxyUsageStore.getLogs();
      expect(clearedLogs.total).toBe(0);
    });
  });
});
