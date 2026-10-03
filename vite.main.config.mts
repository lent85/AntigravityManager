import { defineConfig, loadEnv, normalizePath } from 'vite';
import fs from 'fs';
import path from 'path';
import { builtinModules } from 'module';
import packageJson from './package.json';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import {
  createOpenTelemetryBuildConfig,
  type OpenTelemetryBuildEnv,
} from './src/shared/observability/openTelemetryConfig';

function normalizeTarget(filePath: string): string {
  try {
    return normalizePath(fs.realpathSync.native(filePath));
  } catch {
    return normalizePath(filePath);
  }
}

function resolvePathPlugin() {
  const extensions = [
    '.ts',
    '.tsx',
    '.mts',
    '.js',
    '.jsx',
    '.json',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.mjs',
  ];
  return {
    name: 'resolve-path-fix',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      if (
        !importer ||
        source.startsWith('\0') ||
        source.startsWith('virtual:') ||
        source.startsWith('node:')
      ) {
        return null;
      }

      let cleanImporter = importer;
      const match = cleanImporter.match(/([a-zA-Z]:[\\\/].*)/);
      if (match) {
        cleanImporter = match[1];
      }

      let targetPath: string | null = null;
      if (source.startsWith('.')) {
        targetPath = path.resolve(path.dirname(cleanImporter), source);
      } else if (source.startsWith('@/')) {
        targetPath = path.resolve(process.cwd(), 'src', source.slice(2));
      } else if (path.isAbsolute(source)) {
        targetPath = source;
      }

      if (targetPath) {
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
          return normalizeTarget(targetPath);
        }
        for (const ext of extensions) {
          const testPath = targetPath + ext;
          if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
            return normalizeTarget(testPath);
          }
        }
      }
      return null;
    },
  };
}

const mainProcessExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...Object.keys(packageJson.dependencies || {}),
  'bufferutil',
  'better-sqlite3',
  'keytar',
  'koffi',
  '@napi-rs/keyring',
  '@draculabo/sysinfo-process-enhanced',
  '@opentelemetry/api',
  '@opentelemetry/exporter-metrics-otlp-http',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/resources',
  '@opentelemetry/sdk-metrics',
  '@opentelemetry/sdk-node',
  '@opentelemetry/sdk-trace-node',
  'utf-8-validate',
];

const openTelemetryBuildEnvKeys = [
  'AGM_OTEL_DEBUG',
  'NODE_ENV',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'OTEL_METRICS_EXPORTER',
  'OTEL_RESOURCE_ATTRIBUTES',
  'OTEL_SDK_DISABLED',
  'OTEL_SERVICE_NAME',
  'OTEL_TRACES_EXPORTER',
] as const;

function getOpenTelemetryBuildEnv(mode: string, env: Record<string, string>) {
  return Object.fromEntries(
    openTelemetryBuildEnvKeys.map((key) => {
      const valueFromProcess = process.env[key];
      if (valueFromProcess !== undefined) {
        return [key, valueFromProcess];
      }

      if (mode === 'development') {
        return [key, ''];
      }

      return [key, env[key] || ''];
    }),
  ) as OpenTelemetryBuildEnv;
}

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || env.SENTRY_AUTH_TOKEN;
  const shouldEnableSentry = mode === 'production' && Boolean(sentryAuthToken);
  const openTelemetryBuildEnv = getOpenTelemetryBuildEnv(mode, env);

  return {
    plugins: [
      resolvePathPlugin(),
      ...(shouldEnableSentry
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG || env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT || env.SENTRY_PROJECT,
              authToken: sentryAuthToken,
              release: {
                name: `${process.env.npm_package_name}@${process.env.npm_package_version}`,
              },
            }),
          ]
        : []),
    ],
    define: {
      'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN || env.SENTRY_DSN),
      OPEN_TELEMETRY_BUILD_CONFIG: JSON.stringify(
        createOpenTelemetryBuildConfig(openTelemetryBuildEnv),
      ),
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mts', '.mjs'],
      alias: {
        '@': normalizeTarget(path.resolve(process.cwd(), './src')),
        kafkajs: normalizeTarget(path.resolve(process.cwd(), './src/mocks/empty.ts')),
        mqtt: normalizeTarget(path.resolve(process.cwd(), './src/mocks/empty.ts')),
        amqplib: normalizeTarget(path.resolve(process.cwd(), './src/mocks/empty.ts')),
        'amqp-connection-manager': normalizeTarget(path.resolve(process.cwd(), './src/mocks/empty.ts')),
        nats: normalizeTarget(path.resolve(process.cwd(), './src/mocks/empty.ts')),
        ioredis: normalizeTarget(path.resolve(process.cwd(), './src/mocks/empty.ts')),
        '@fastify/static': normalizeTarget(path.resolve(process.cwd(), './src/mocks/empty.ts')),
        '@fastify/view': normalizeTarget(path.resolve(process.cwd(), './src/mocks/empty.ts')),
        '@nestjs/microservices': normalizeTarget(path.resolve(process.cwd(), './src/mocks/nestjs-microservices')),
        '@nestjs/websockets': normalizeTarget(path.resolve(process.cwd(), './src/mocks/nestjs-websockets')),
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        external: mainProcessExternals,
      },
    },
  };
});
