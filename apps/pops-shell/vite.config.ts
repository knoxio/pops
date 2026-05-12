import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/**
 * Optional override that replaces the canonical `@pops/module-registry`
 * entrypoint with a pre-built snapshot file for one Playwright project's
 * shell server (PRD-101 US-11 follow-up, issue #2595). The snapshot is
 * emitted by `scripts/build-registry-snapshot.ts` and contains the same
 * runtime surface (`KNOWN_MODULES`, `MODULES`, `findModule`, `isModuleId`)
 * computed against a project-specific `POPS_APPS` value. Production and
 * default dev builds leave the variable unset and resolve the workspace
 * package as usual.
 */
const registrySnapshot = process.env.POPS_REGISTRY_SNAPSHOT;

const usingSnapshot = registrySnapshot !== undefined && registrySnapshot.length > 0;

const registryAlias = usingSnapshot
  ? { '@pops/module-registry': path.resolve(registrySnapshot) }
  : {};

/**
 * Each install-set variant needs its own Vite dep-bundle cache so the
 * pre-bundled `@pops/module-registry` (a workspace dep, eligible for
 * `optimizeDeps`) from one server can't be reused by a sibling server
 * pointing at a different snapshot. Default Vite cacheDir is shared
 * across `pnpm test:e2e` runs, which is fine for production but
 * dangerous for two coexisting projects.
 */
const cacheDir = usingSnapshot
  ? path.resolve(__dirname, 'node_modules/.vite-finance-only')
  : undefined;

export default defineConfig({
  cacheDir,
  define: {
    __BUILD_VERSION__: JSON.stringify(
      process.env.BUILD_VERSION && process.env.BUILD_VERSION !== 'dev'
        ? `f${process.env.BUILD_VERSION}`
        : 'dev'
    ),
  },
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...registryAlias,
    },
  },
  server: {
    port: 5568,
    strictPort: true,
    host: true,
    clearScreen: false,
    hmr: {
      host: 'localhost',
    },
    proxy: {
      '/trpc': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Don't rewrite — tRPC expects /trpc prefix
      },
      '/media/images': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/inventory/documents': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
