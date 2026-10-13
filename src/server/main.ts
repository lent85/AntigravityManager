import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { logger } from '../shared/logging/logger';
import { AccountLeaseService } from '../modules/proxy-gateway/server/modules/account-lease/account-lease.service';
import { OpenAIOperations } from '../modules/proxy-gateway/server/modules/openai/openai-operations.service';
import { OpenAIService } from '../modules/proxy-gateway/server/modules/openai/openai.service';
import { DEFAULT_MAX_FILE_BYTES } from '../modules/proxy-gateway/server/modules/files/file-store.types';
import { attachOpenAIResponsesWebSocketServer } from '../modules/proxy-gateway/server/modules/openai/responses/openai-responses-websocket.server';
import { createResponsesWebSocketOperations } from '@/modules/proxy-gateway/server/modules/openai/responses/openai-responses-websocket.operations';
import {
  extractApiKeyToken,
  hasConfiguredApiKey,
} from '../modules/proxy-gateway/server/guards/api-key-auth.util';
import { MAX_IMAGE_GENERATION_BODY_BYTES } from '@/modules/proxy-gateway/server/modules/openai/media/image-input-validation';
import {
  DEFAULT_PROXY_JSON_BODY_LIMIT_BYTES,
  isModelPayloadRoute,
} from '../modules/proxy-gateway/server/proxy.constants';
import { registerTrafficAuditHttpHooks } from '@/modules/proxy-gateway/audit/traffic-audit-context';
import { trafficAuditService } from '@/modules/proxy-gateway/audit/traffic-audit.service';
import { thoughtStoreService } from '@/modules/proxy-gateway/thought-store/thought-store.service';

import { ProxyConfig, ModelPricingConfig } from '@/modules/config/types';
import { getServerConfig, setServerConfig } from './server-config';
import { proxyUsageStore } from '../modules/proxy-gateway/server/shared/services/proxy-usage.store';
import {
  getClientInfo,
  getResponseUsage,
  resolveConfiguredApiKeys,
  setCurrentRequest,
} from '../modules/proxy-gateway/server/shared/services/request-usage-context';

function calculateEstimatedCost(
  pricing: Record<string, ModelPricingConfig> | undefined,
  model: string | undefined,
  promptTokens: number,
  completionTokens: number,
): number {
  if (!pricing || !model) {
    return 0;
  }
  const modelConfig = pricing[model];
  if (!modelConfig) {
    return 0;
  }
  let cost = 0;
  if (modelConfig.prompt_price_per_m && promptTokens > 0) {
    cost += (promptTokens / 1_000_000) * modelConfig.prompt_price_per_m;
  }
  if (modelConfig.completion_price_per_m && completionTokens > 0) {
    cost += (completionTokens / 1_000_000) * modelConfig.completion_price_per_m;
  }
  if (modelConfig.request_price) {
    cost += modelConfig.request_price;
  }
  return cost;
}

let app: NestFastifyApplication | null = null;
let currentPort: number = 0;
let detachResponsesWebSocketServer: (() => void) | null = null;

export type NestServerStartResult =
  | {
      success: true;
      port: number;
      base_url: string;
    }
  | {
      success: false;
      reason: 'address-in-use' | 'unknown';
      port: number;
      message: string;
    };

interface RawMediaBodyParserHost {
  addContentTypeParser: (
    matcher: RegExp,
    options: { bodyLimit: number; parseAs: 'buffer' },
    handler: (request: unknown, body: Buffer, done: (error: null, body: Buffer) => void) => void,
  ) => void;
}

interface RouteLimitHost {
  addHook: (
    name: 'onRoute',
    handler: (options: { bodyLimit?: number; method: string | string[]; url: string }) => void,
  ) => void;
}

export function registerImageGenerationBodyLimit(instance: RouteLimitHost): void {
  instance.addHook('onRoute', (options) => {
    const methods = Array.isArray(options.method) ? options.method : [options.method];
    if (methods.includes('POST') && options.url === '/v1/images/generations') {
      options.bodyLimit = MAX_IMAGE_GENERATION_BODY_BYTES;
    }
  });
}

export function registerModelRouteBodyLimits(instance: RouteLimitHost): void {
  instance.addHook('onRoute', (options) => {
    const methods = Array.isArray(options.method) ? options.method : [options.method];
    if (methods.includes('POST') && isModelPayloadRoute(options.url)) {
      options.bodyLimit = DEFAULT_PROXY_JSON_BODY_LIMIT_BYTES;
    }
  });
}

/**
 * Lets `POST /upload/v1beta/files` accept Google's simple media form, where the
 * whole request body is the file and `Content-Type` names its type.
 *
 * Registered for media families only, and with its own body limit rather than
 * the server's: `application/json` and `multipart/form-data` already have
 * exact-match parsers, Fastify prefers an exact match over a matcher, so every
 * existing route keeps both its parser and its current ceiling.
 */
function registerRawMediaBodyParser(instance: RawMediaBodyParserHost): void {
  instance.addContentTypeParser(
    /^(?:application|audio|font|image|model|text|video)\//u,
    { bodyLimit: DEFAULT_MAX_FILE_BYTES + 1024 * 1024, parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body);
    },
  );
}

function isAddressInUseError(error: unknown): boolean {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) {
    return false;
  }

  return Reflect.get(error, 'code') === 'EADDRINUSE';
}

async function cleanupFailedServerStart() {
  if (!app) {
    return;
  }

  try {
    detachResponsesWebSocketServer?.();
    detachResponsesWebSocketServer = null;
    await app.close();
  } catch (closeError) {
    logger.warn('Failed to clean up NestJS server after startup failure', closeError);
  } finally {
    app = null;
    currentPort = 0;
  }
}

export function createFastifyAdapter(): FastifyAdapter {
  const adapter = new FastifyAdapter();
  registerImageGenerationBodyLimit(adapter.getInstance());
  registerModelRouteBodyLimits(adapter.getInstance());
  return adapter;
}

export async function bootstrapNestServer(config: ProxyConfig): Promise<NestServerStartResult> {
  const port = config.port || 8045;
  if (app) {
    logger.info('NestJS server already running.');
    return {
      success: true,
      port: currentPort,
      base_url: `http://localhost:${currentPort}`,
    };
  }

  setServerConfig(config);

  try {
    const fastifyAdapter = createFastifyAdapter();
    registerTrafficAuditHttpHooks(fastifyAdapter.getInstance());

    // Register request instrumentation hooks for usage tracking
    const fastifyInstance = fastifyAdapter.getInstance() as any;
    fastifyInstance.addHook('onRequest', (request: any, _reply: any, done: () => void) => {
      setCurrentRequest(request);
      if (request.raw) {
        request.raw.__startTime = Date.now();
      }
      done();
    });

    fastifyInstance.addHook('onResponse', (request: any, reply: any, done: () => void) => {
      try {
        const url = request.url || '';
        if (
          url === '/health' ||
          url.startsWith('/static') ||
          url === '/favicon.ico' ||
          (url === '/' && request.method === 'GET')
        ) {
          done();
          return;
        }

        const durationMs = Date.now() - (request.raw?.__startTime || Date.now());
        const clientInfo = getClientInfo(request);
        const usage = getResponseUsage(request);

        const currentConfig = getServerConfig();
        const model = usage?.model || request.body?.model || '';
        const promptTokens = usage?.promptTokens || 0;
        const completionTokens = usage?.completionTokens || 0;
        const totalTokens = usage?.totalTokens || promptTokens + completionTokens;
        const cachedTokens = usage?.cachedTokens || 0;

        const cost = calculateEstimatedCost(
          currentConfig?.model_pricing,
          model,
          promptTokens,
          completionTokens,
        );

        let protocol: 'openai' | 'anthropic' | 'gemini' | 'unknown' = usage?.protocol || 'unknown';
        if (protocol === 'unknown') {
          if (url.includes('/messages') || url.includes('/complete')) {
            protocol = 'anthropic';
          } else if (url.includes(':generateContent') || url.includes('/v1beta/models')) {
            protocol = 'gemini';
          } else if (url.startsWith('/v1/')) {
            protocol = 'openai';
          }
        }

        const keyId = clientInfo?.keyId || (reply.statusCode === 401 ? 'unauthorized' : 'unknown');
        const keyName =
          clientInfo?.keyName ||
          (reply.statusCode === 401 ? 'Unauthorized Access' : 'Unknown Client');

        proxyUsageStore.record({
          timestamp: Date.now(),
          keyId,
          keyName,
          accountId: usage?.accountId,
          accountEmail: usage?.accountEmail,
          protocol,
          endpoint: url.split('?')[0],
          model,
          statusCode: reply.statusCode,
          durationMs,
          promptTokens,
          completionTokens,
          totalTokens,
          cachedTokens,
          cost,
          errorMessage:
            usage?.errorMessage ||
            (reply.statusCode >= 400 ? `HTTP ${reply.statusCode}` : undefined),
          ip: request.ip,
          userAgent: request.headers?.['user-agent'],
        });
      } catch (err) {
        logger.error('Failed to record proxy usage in onResponse hook', err);
      }
      done();
    });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
      abortOnError: false,
      logger: ['error', 'warn', 'log'],
    });

    await app.register(fastifyMultipart, {
      limits: {
        files: 16,
        fileSize: 100 * 1024 * 1024,
        fields: 32,
      },
    });
    registerRawMediaBodyParser(fastifyAdapter.getInstance() as RawMediaBodyParserHost);

    const configuredKeys = resolveConfiguredApiKeys(config);
    const hasAnyApiKey = configuredKeys.length > 0;
    if (hasAnyApiKey) {
      app.enableCors();
    }

    const listenHost = hasAnyApiKey ? '0.0.0.0' : '127.0.0.1';
    await app.listen(port, listenHost);
    const openAIOperations = app.get(OpenAIOperations);
    const openAIService = app.get(OpenAIService);
    detachResponsesWebSocketServer = attachOpenAIResponsesWebSocketServer(app.getHttpServer(), {
      ...createResponsesWebSocketOperations(openAIOperations, openAIService),
      isAuthorized: (request) => {
        const currentConfig = getServerConfig();
        const keys = resolveConfiguredApiKeys(currentConfig);
        if (keys.length === 0) {
          return true;
        }
        const clientToken = extractApiKeyToken(request.headers);
        if (!clientToken) {
          return false;
        }
        return keys.some((k) => k.enabled !== false && k.key.trim() === clientToken.trim());
      },
    });
    currentPort = port;
    logger.info(`NestJS Proxy Server running on http://localhost:${port}`);
    return {
      success: true,
      port,
      base_url: `http://localhost:${port}`,
    };
  } catch (error) {
    await cleanupFailedServerStart();

    if (isAddressInUseError(error)) {
      const message = `Port ${port} is already in use`;
      logger.warn(`NestJS Proxy Server could not start: ${message}`, error);
      return {
        success: false,
        reason: 'address-in-use',
        port,
        message,
      };
    }

    logger.error('Failed to start NestJS server', error);
    return {
      success: false,
      reason: 'unknown',
      port,
      message: error instanceof Error ? error.message : 'Failed to start NestJS server',
    };
  }
}

export async function stopNestServer(): Promise<boolean> {
  if (app) {
    try {
      detachResponsesWebSocketServer?.();
      detachResponsesWebSocketServer = null;
      await app.close();
      const storeResults = await Promise.allSettled([
        trafficAuditService.close(),
        thoughtStoreService.close(),
      ]);
      const failures = storeResults.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Gateway diagnostic stores did not close');
      }
      app = null;
      currentPort = 0;
      logger.info('NestJS server stopped.');
      return true;
    } catch (e) {
      logger.error('Failed to stop NestJS server', e);
      return false;
    }
  }
  return true;
}

export function isNestServerRunning(): boolean {
  return app !== null;
}

export async function reloadNestServerAccountLeaseCache(): Promise<boolean> {
  if (!app) {
    return false;
  }

  const accountLeaseService = app.get(AccountLeaseService);
  await accountLeaseService.reloadAllAccountsOrThrow();
  return true;
}

export function evictNestServerAccountLeaseAccount(accountId: string): boolean {
  if (!app) {
    return false;
  }

  return app.get(AccountLeaseService).evictAccount(accountId);
}

export function updateNestServerAccountLeaseOAuthHealth(
  accountId: string,
  oauthHealth: Parameters<AccountLeaseService['updateAccountOAuthHealth']>[1],
): boolean {
  if (!app) {
    return false;
  }

  return app.get(AccountLeaseService).updateAccountOAuthHealth(accountId, oauthHealth);
}

export async function getNestServerStatus(): Promise<{
  running: boolean;
  port: number;
  base_url: string;
  active_accounts: number;
}> {
  const running = isNestServerRunning();
  let activeAccounts = 0;

  if (app) {
    try {
      const accountLeaseService = app.get(AccountLeaseService);
      activeAccounts = accountLeaseService.getAccountCount();
    } catch {
      // AccountLeaseService might not be available
    }
  }

  return {
    running,
    port: currentPort,
    base_url: running ? `http://localhost:${currentPort}` : '',
    active_accounts: activeAccounts,
  };
}
