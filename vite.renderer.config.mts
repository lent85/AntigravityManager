import { defineConfig, loadEnv, normalizePath, transformWithEsbuild, type Plugin } from 'vite';
import { createRequire } from 'node:module';
import fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import path from 'path';
// codeInspectorPlugin is dynamically imported in dev mode only
import { sentryVitePlugin } from '@sentry/vite-plugin';
import {
  createClarityBuildConfig,
  type ClarityBuildEnv,
} from './src/shared/analytics/clarityConfig';

const require = createRequire(import.meta.url);
const enhancedResolve = require('enhanced-resolve');

const cssResolver = enhancedResolve.ResolverFactory.createResolver({
  fileSystem: new enhancedResolve.CachedInputFileSystem(fs, 4000),
  useSyncFileSystemCalls: true,
  extensions: ['.css'],
  mainFields: ['style'],
  conditionNames: ['style'],
  modules: ['node_modules'],
});

const jsResolver = enhancedResolve.ResolverFactory.createResolver({
  fileSystem: new enhancedResolve.CachedInputFileSystem(fs, 4000),
  useSyncFileSystemCalls: true,
  extensions: ['.js', '.json', '.node', '.ts'],
  mainFields: ['module', 'jsnext:main', 'main'],
  conditionNames: ['import', 'module', 'browser', 'default'],
  modules: ['node_modules'],
});

const requireResolver = enhancedResolve.ResolverFactory.createResolver({
  fileSystem: new enhancedResolve.CachedInputFileSystem(fs, 4000),
  useSyncFileSystemCalls: true,
  extensions: ['.js', '.json', '.node', '.ts'],
  conditionNames: ['node', 'require'],
  modules: ['node_modules'],
});

// Workaround for Tailwind CSS v4 in paths containing '#' on Windows:
// enhanced-resolve escapes '#' by prefixing it with '\0', which causes Node.js fs operations to throw
// "The argument 'path' must be a string without null bytes".
// Providing globalThis.__tw_resolve strips the '\0' escape characters.
if (typeof (globalThis as any).__tw_resolve !== 'function') {
  try {

    (globalThis as any).__tw_resolve = (id: string, base: string) => {
      try {
        const dir = fs.existsSync(base) && fs.statSync(base).isDirectory() ? base : path.dirname(base);
        try {
          const res = cssResolver.resolveSync({}, dir, id);
          if (res) {
            return (res as string).replace(/\0/g, '');
          }
        } catch {}
        try {
          const res = jsResolver.resolveSync({}, dir, id);
          if (res) {
            return (res as string).replace(/\0/g, '');
          }
        } catch {}
        try {
          const res = requireResolver.resolveSync({}, dir, id);
          if (res) {
            return (res as string).replace(/\0/g, '');
          }
        } catch {}
      } catch {}
      return null;
    };
  } catch {}
}

if (typeof (globalThis as any).__tw_readFile !== 'function') {
  (globalThis as any).__tw_readFile = (filePath: string, encoding: string) => {
    try {
      const cleanPath = filePath.replace(/\0/g, '');
      return fs.promises.readFile(cleanPath, (encoding as BufferEncoding) || 'utf-8');
    } catch {}
    return null;
  };
}

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
    '.css',
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

      const [cleanSource, ...queryParts] = source.split('?');
      const query = queryParts.length > 0 ? `?${queryParts.join('?')}` : '';

      let cleanImporter = importer.split('?')[0];
      const match = cleanImporter.match(/([a-zA-Z]:[\\\/].*)/);
      if (match) {
        cleanImporter = match[1];
      }

      let targetPath: string | null = null;
      if (cleanSource.startsWith('.')) {
        targetPath = path.resolve(path.dirname(cleanImporter), cleanSource);
      } else if (cleanSource.startsWith('@/')) {
        targetPath = path.resolve(process.cwd(), 'src', cleanSource.slice(2));
      } else if (cleanSource.startsWith('/')) {
        targetPath = path.resolve(process.cwd(), '.' + cleanSource);
      } else if (path.isAbsolute(cleanSource)) {
        targetPath = cleanSource;
      }

      if (targetPath) {
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
          return normalizeTarget(targetPath) + query;
        }
        for (const ext of extensions) {
          const testPath = targetPath + ext;
          if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
            return normalizeTarget(testPath) + query;
          }
        }
      }
      if (
        !cleanSource.startsWith('.') &&
        !cleanSource.startsWith('@/') &&
        !cleanSource.startsWith('/') &&
        !path.isAbsolute(cleanSource) &&
        cleanSource.includes('/')
      ) {
        try {
          const dir = importer ? path.dirname(cleanImporter) : process.cwd();
          const res = jsResolver.resolveSync({}, dir, cleanSource);
          if (res) {
            const clean = (res as string).replace(/\0/g, '');
            if (fs.existsSync(clean) && fs.statSync(clean).isFile()) {
              return normalizeTarget(clean) + query;
            }
          }
        } catch {}
      }

      return null;
    },
    load(id: string) {
      if (id.includes('?')) {
        const [filePath] = id.split('?');
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          return fs.readFileSync(filePath, 'utf-8');
        }
      }
      if (/(\.(?:[cm]?[jt]sx?|json))#/.test(id)) {
        const realPath = id.replace(/(\.(?:[cm]?[jt]sx?|json))#.*$/, '$1');
        if (fs.existsSync(realPath) && fs.statSync(realPath).isFile()) {
          return fs.readFileSync(realPath, 'utf-8');
        }
      }
      return null;
    },
  };
}

function esbuildQueryFixPlugin(): Plugin {
  return {
    name: 'esbuild-query-fix',
    async transform(code: string, id: string) {
      if (id.includes('?')) {
        const [filePath] = id.split('?');
        const ext = path.extname(filePath).slice(1);
        if (ext === 'tsx' || ext === 'jsx' || ext === 'ts' || ext === 'js') {
          return await transformWithEsbuild(code, filePath, {
            loader: ext as 'tsx' | 'jsx' | 'ts' | 'js',
            target: 'esnext',
            jsx: 'automatic',
          });
        }
      }
      return null;
    },
  };
}

const clarityBuildEnvKeys = ['CLARITY_PROJECT_ID', 'NODE_ENV'] as const;
const REACT_SCAN_ENABLED_ENV = 'ANTIGRAVITY_ENABLE_REACT_SCAN';
const REACT_SCAN_ENTRY = '/src/modules/app-shell/diagnostics/react-scan.ts';

/**
 * React Scan has to be an independently injected development entry. Importing
 * it from the renderer would make the diagnostic available to every build
 * before a runtime condition could exclude the production bundle.
 */
function createReactScanPlugin(): Plugin {
  return {
    name: 'antigravity-react-scan',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'script',
          attrs: {
            type: 'module',
            src: REACT_SCAN_ENTRY,
          },
          injectTo: 'body-prepend',
        },
      ],
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || env.SENTRY_AUTH_TOKEN;
  const shouldEnableSentry =
    mode === 'production' &&
    Boolean(sentryAuthToken) &&
    process.env.AGM_DISABLE_SENTRY_UPLOAD !== '1';
  const shouldEnableReactScan =
    mode === 'development' &&
    (process.env[REACT_SCAN_ENABLED_ENV] ?? env[REACT_SCAN_ENABLED_ENV]) === '1';
  const clarityBuildEnv = Object.fromEntries(
    clarityBuildEnvKeys.map((key) => [key, process.env[key] || env[key] || '']),
  ) as ClarityBuildEnv;
  clarityBuildEnv.NODE_ENV = clarityBuildEnv.NODE_ENV || mode;

  return {
    // Keep the development listener reachable when IPv6 loopback is unavailable.
    server: { host: '127.0.0.1' },
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
              // Electron loads files from app://, so we need to normalize paths for Source Map matching
              sourcemaps: {
                // Rewrite the source paths to strip the Electron app:// protocol
                rewriteSources: (source) => {
                  // Transform: app:///.vite/renderer/main_window/assets/index.js
                  // Into:      ~/.vite/renderer/main_window/assets/index.js
                  return source.replace(/^app:\/\/\//, '~/');
                },
              },
            }),
          ]
        : []),
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      tailwindcss(),
      ...(mode === 'production' ? [] : [require('code-inspector-plugin').codeInspectorPlugin({ bundler: 'vite' })]),
      ...(shouldEnableReactScan ? [createReactScanPlugin()] : []),
      react({
        babel: {
          plugins: ['babel-plugin-react-compiler'],
        },
      }),
      esbuildQueryFixPlugin(),
    ],
    optimizeDeps: {
      entries: ['index.html'],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN || env.SENTRY_DSN),
      CLARITY_BUILD_CONFIG: JSON.stringify(createClarityBuildConfig(clarityBuildEnv)),
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mts', '.mjs', '.css'],
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': normalizeTarget(path.resolve(process.cwd(), './src')),
      },
    },
  };
});
