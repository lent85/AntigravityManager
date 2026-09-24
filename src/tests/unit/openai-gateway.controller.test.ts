import { GUARDS_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_APP_CONFIG } from '@/modules/config/types';
import { AdminGuard } from '@/modules/proxy-gateway/server/guards/admin.guard';
import { ProxyGuard } from '@/modules/proxy-gateway/server/guards/proxy.guard';
import {
  OpenAIBillingController,
  OpenAIGatewayController,
} from '@/modules/proxy-gateway/server/modules/openai/openai-gateway.controller';
import { OpenAIOperations } from '@/modules/proxy-gateway/server/modules/openai/openai-operations.service';
import { proxyUsageStore } from '@/modules/proxy-gateway/server/shared/services/proxy-usage.store';
import { getServerConfig, setServerConfig } from '@/server/server-config';

function createReply() {
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

describe('OpenAI gateway extension routes', () => {
  const previousConfig = getServerConfig();

  afterEach(() => {
    proxyUsageStore.clear();
    setServerConfig(previousConfig ?? DEFAULT_APP_CONFIG.proxy);
  });

  it('requires the admin guard for account quota and billing metadata', () => {
    const quotaGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      OpenAIGatewayController.prototype.quota,
    ) as unknown[];
    const billingGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      OpenAIBillingController,
    ) as unknown[];
    const quoteGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      OpenAIGatewayController.prototype.quote,
    ) as unknown[];

    const gatewayGuards = Reflect.getMetadata(GUARDS_METADATA, OpenAIGatewayController) as
      | unknown[]
      | undefined;

    expect(gatewayGuards).toBeUndefined();
    expect(quotaGuards).toEqual([AdminGuard]);
    expect(billingGuards).toEqual([AdminGuard]);
    expect(quoteGuards).toEqual([ProxyGuard]);
  });

  it('omits pricing, quota, and capabilities when no authoritative value exists', () => {
    setServerConfig({ ...DEFAULT_APP_CONFIG.proxy, model_pricing: {} });
    const operations = new OpenAIOperations(
      {} as never,
      {
        getAllCollectedModels: () => ['gemini-3-flash'],
        getAggregatedModelQuotaSnapshot: () => ({}),
      } as never,
    );
    const reply = createReply();

    operations.listModelsQuote(reply as never);

    expect(reply.status).toHaveBeenCalledWith(200);
    const payload = vi.mocked(reply.send).mock.calls[0]?.[0] as {
      data: Array<Record<string, unknown>>;
    };
    const quote = payload.data.find((item) => item.id === 'gemini-3-flash');
    expect(quote).toEqual({
      created: expect.any(Number),
      id: 'gemini-3-flash',
      object: 'model_quote',
      owned_by: 'antigravity',
    });
  });

  it('returns billing totals from recorded usage instead of fixed zeroes', async () => {
    proxyUsageStore.record({
      protocol: 'openai',
      endpoint: '/v1/responses',
      statusCode: 200,
      durationMs: 20,
      cost: 1.25,
      totalTokens: 30,
    });
    const operations = new OpenAIOperations({} as never);
    const reply = createReply();

    await operations.getDashboardBillingUsage(reply as never);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        object: 'billing_usage',
        source: 'configured_model_pricing',
        total_usage: 1.25,
        daily_costs: [expect.objectContaining({ cost: 1.25, tokens: 30 })],
      }),
    );
  });
});
