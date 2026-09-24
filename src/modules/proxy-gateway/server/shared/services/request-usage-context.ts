import { AsyncLocalStorage } from 'node:async_hooks';
import type { ProxyApiKey, ProxyConfig } from '@/modules/config/types';
import { hasConfiguredApiKey } from '../../guards/api-key-auth.util';

export interface RequestClientInfo {
  keyId: string;
  keyName: string;
}

export interface RequestUsageInfo {
  accountId?: string;
  accountEmail?: string;
  model?: string;
  protocol?: 'openai' | 'anthropic' | 'gemini';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  errorMessage?: string;
}

const CLIENT_INFO_SYMBOL = Symbol('proxy_client_info');
const USAGE_INFO_SYMBOL = Symbol('proxy_usage_info');
const requestStore = new AsyncLocalStorage<unknown>();

export function setCurrentRequest(request: unknown): void {
  requestStore.enterWith(request);
}

export function getCurrentRequest(): unknown {
  return requestStore.getStore();
}

export function recordAccountUsage(account: {
  id: string;
  email?: string | null;
  name?: string | null;
}): void {
  const req = getCurrentRequest();
  if (req) {
    setResponseUsage(req, {
      accountId: account.id,
      accountEmail: account.email || account.name || account.id,
    });
  }
}

export function attachClientInfo(request: unknown, info: RequestClientInfo): void {
  if (typeof request === 'object' && request !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any)[CLIENT_INFO_SYMBOL] = info;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (request as any).raw;
    if (typeof raw === 'object' && raw !== null) {
      raw[CLIENT_INFO_SYMBOL] = info;
    }
  }
}

export function getClientInfo(request: unknown): RequestClientInfo | undefined {
  if (typeof request === 'object' && request !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (request as any)[CLIENT_INFO_SYMBOL] ?? (request as any).raw?.[CLIENT_INFO_SYMBOL];
  }
  return undefined;
}

export function setResponseUsage(request: unknown, usage: RequestUsageInfo): void {
  if (typeof request === 'object' && request !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (request as any)[USAGE_INFO_SYMBOL] || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any)[USAGE_INFO_SYMBOL] = { ...current, ...usage };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (request as any).raw;
    if (typeof raw === 'object' && raw !== null) {
      raw[USAGE_INFO_SYMBOL] = (request as any)[USAGE_INFO_SYMBOL];
    }
  }
}

export function getResponseUsage(request: unknown): RequestUsageInfo | undefined {
  if (typeof request === 'object' && request !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (request as any)[USAGE_INFO_SYMBOL] ?? (request as any).raw?.[USAGE_INFO_SYMBOL];
  }
  return undefined;
}

/**
 * Returns all configured keys for authentication.
 * If api_keys is populated and has keys, it is authoritative.
 * If api_keys is empty but legacy api_key exists, converts to a Default Client.
 */
export function resolveConfiguredApiKeys(config: ProxyConfig | null | undefined): ProxyApiKey[] {
  if (!config) {
    return [];
  }

  // If api_keys is populated and has keys, it is authoritative
  if (config.api_keys && config.api_keys.length > 0) {
    return config.api_keys;
  }

  // Backward compatibility fallback: single legacy api_key
  if (hasConfiguredApiKey(config.api_key)) {
    return [
      {
        id: 'default',
        name: 'Default Client',
        key: config.api_key.trim(),
        created_at: 0,
        enabled: true,
      },
    ];
  }

  return [];
}
