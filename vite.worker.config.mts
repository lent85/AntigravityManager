import fs from 'node:fs';
import path from 'node:path';

import { defineConfig, normalizePath } from 'vite';

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

// Worker entries are compiled independently by Electron Forge and share the main-process
// output directory. Native SQLite remains external so Electron loads the unpacked ABI-matched
// binary, while Drizzle and the feature repositories are bundled into each worker entry.
export default defineConfig({
  plugins: [resolvePathPlugin()],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mts', '.mjs'],
    alias: {
      '@': normalizeTarget(path.resolve(process.cwd(), './src')),
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
});
