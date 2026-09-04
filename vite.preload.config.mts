import { defineConfig, loadEnv } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import fs from 'fs';
import path from 'path';

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

      let targetPath: string | null = null;
      if (source.startsWith('.')) {
        targetPath = path.resolve(path.dirname(importer), source);
      } else if (source.startsWith('@/')) {
        targetPath = path.resolve(process.cwd(), 'src', source.slice(2));
      } else if (path.isAbsolute(source)) {
        targetPath = source;
      }

      if (targetPath) {
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
          return targetPath;
        }
        for (const ext of extensions) {
          const testPath = targetPath + ext;
          if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
            return testPath;
          }
        }
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || env.SENTRY_AUTH_TOKEN;
  const shouldEnableSentry = mode === 'production' && Boolean(sentryAuthToken);

  return {
    envPrefix: ['VITE_', 'ANTIGRAVITY_ENABLE_PERFORMANCE_RECORDER'],
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
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mts', '.mjs'],
      alias: {
        '@': path.resolve(process.cwd(), './src'),
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        external: ['better-sqlite3', 'keytar'],
      },
    },
  };
});
