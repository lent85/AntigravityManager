/**
 * Gateway ORPC Router
 * Provides routes for controlling the API Gateway service
 */
import { os } from '@orpc/server';
import { z } from 'zod';
import {
  startGateway,
  stopGateway,
  getGatewayStatus,
  getContextCacheStatus,
  generateApiKey,
  createNamedApiKey,
  getProxyUsageStats,
  getProxyAccessLogs,
  clearProxyUsageStats,
} from './handlers';
import { proxyModelAvailabilityStore } from '../server/shared/services/model-availability.service';
import { openCodeCredentialService } from '../opencode-sync/opencode-credentials';
import { openCodeSyncService } from '../opencode-sync/opencode-sync';

const OpenCodeModelInputSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
});

const OpenCodeSyncInputSchema = z.object({
  baseUrl: z.string().url(),
  models: z.array(OpenCodeModelInputSchema).optional(),
  syncAccounts: z.boolean().default(false),
});

const OpenCodeClearInputSchema = z.object({
  baseUrl: z.string().url(),
  clearLegacy: z.boolean(),
});

export const gatewayRouter = os.prefix('/gateway').router({
  start: os
    .input(z.object({ port: z.number().int().min(1024).max(65535) }))
    .handler(async ({ input }) => {
      return startGateway(input.port);
    }),

  stop: os.handler(async () => {
    const success = await stopGateway();
    if (!success) {
      throw new Error('Failed to stop gateway');
    }
    return { success };
  }),

  status: os.handler(async () => {
    return getGatewayStatus();
  }),

  contextCacheStats: os
    .output(
      z.object({
        enabled: z.boolean(),
        stats: z.object({
          activeEntries: z.number().int().nonnegative(),
          creationFailures: z.number().int().nonnegative(),
          creations: z.number().int().nonnegative(),
          hits: z.number().int().nonnegative(),
          invalidations: z.number().int().nonnegative(),
          lookups: z.number().int().nonnegative(),
        }),
      }),
    )
    .handler(() => getContextCacheStatus()),

  generateKey: os.handler(async () => {
    const newKey = await generateApiKey();
    return { api_key: newKey };
  }),

  createNamedKey: os
    .input(z.object({ name: z.string().default('New Client') }))
    .handler(async ({ input }) => {
      return createNamedApiKey(input.name);
    }),

  usageStats: os
    .input(
      z
        .object({
          timeRange: z.enum(['today', '24h', '7d', '30d', 'all']).optional(),
          keyId: z.string().optional(),
          accountId: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      return getProxyUsageStats(input);
    }),

  accessLogs: os
    .input(
      z
        .object({
          timeRange: z.enum(['today', '24h', '7d', '30d', 'all']).optional(),
          keyId: z.string().optional(),
          accountId: z.string().optional(),
          model: z.string().optional(),
          status: z.enum(['all', 'success', 'error', 'auth']).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      return getProxyAccessLogs(input);
    }),

  clearUsage: os.handler(async () => {
    return clearProxyUsageStats();
  }),

  openCodeStatus: os.input(z.object({ baseUrl: z.string().url() })).handler(async ({ input }) => {
    return openCodeSyncService.getStatus(input.baseUrl);
  }),

  syncOpenCode: os.input(OpenCodeSyncInputSchema).handler(async ({ input }) => {
    return openCodeSyncService.sync(input);
  }),

  readOpenCodeConfig: os.handler(async () => {
    return openCodeSyncService.readConfigForDisplay();
  }),

  restoreOpenCode: os.handler(async () => {
    return openCodeSyncService.restore();
  }),

  clearOpenCode: os.input(OpenCodeClearInputSchema).handler(async ({ input }) => {
    return openCodeSyncService.clear(input);
  }),

  revokeOpenCodeKey: os.handler(() => {
    openCodeCredentialService.revoke();
    return { success: true };
  }),

  modelAvailability: os
    .output(
      z.array(
        z.object({
          accountId: z.string(),
          modelId: z.string(),
          reason: z.enum([
            'model_not_supported',
            'model_forbidden',
            'quota_exhausted',
            'rate_limited',
          ]),
          unavailableUntil: z.number(),
          status: z.number().int().min(100).max(599).optional(),
          detectedAt: z.number(),
          message: z.string().optional(),
        }),
      ),
    )
    .handler(async () => {
      return proxyModelAvailabilityStore.getSnapshot();
    }),
});
