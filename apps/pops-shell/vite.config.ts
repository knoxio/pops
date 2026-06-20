import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/**
 * PRD-101 US-11 follow-up (issue #2595): when `POPS_REGISTRY_SNAPSHOT`
 * is set, alias `@pops/module-registry` to the snapshot file so the
 * shell consumes a build-specific install set. Unset in production and
 * default dev builds.
 */
const registrySnapshot = process.env.POPS_REGISTRY_SNAPSHOT;

const usingSnapshot = registrySnapshot !== undefined && registrySnapshot.length > 0;

const registryAlias = usingSnapshot
  ? { '@pops/module-registry': path.resolve(registrySnapshot) }
  : {};

/**
 * Per-variant Vite dep-bundle cache. Each `POPS_REGISTRY_SNAPSHOT`
 * value gets its own `node_modules/.vite-<slug>` directory derived from
 * the snapshot file's basename so concurrent shell servers built from
 * different snapshots never share a pre-bundled `@pops/module-registry`.
 */
const snapshotSlug = usingSnapshot
  ? path.basename(registrySnapshot, path.extname(registrySnapshot)).replace(/[^a-zA-Z0-9_-]+/g, '-')
  : undefined;

const cacheDir = snapshotSlug
  ? path.resolve(__dirname, `node_modules/.vite-${snapshotSlug}`)
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
      // The core pillar now serves a REST contract; app-ai's generated Hey
      // API client targets the shell's `/core-api` path (see
      // `@pops/app-ai` core-api-runtime-config). Mirrors `/media-api`.
      '/core-api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (urlPath: string) => urlPath.replace(/^\/core-api/, ''),
      },
      '/lists-api': {
        target: 'http://localhost:3006',
        changeOrigin: true,
        rewrite: (urlPath: string) => urlPath.replace(/^\/lists-api/, ''),
      },
      '/inventory-api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (urlPath: string) => urlPath.replace(/^\/inventory-api/, ''),
      },
      '/finance-api': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        rewrite: (urlPath: string) => urlPath.replace(/^\/finance-api/, ''),
      },
      '/food-api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (urlPath: string) => urlPath.replace(/^\/food-api/, ''),
      },
      '/media-api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (urlPath: string) => urlPath.replace(/^\/media-api/, ''),
      },
      '/cerebrum-api': {
        target: 'http://localhost:3007',
        changeOrigin: true,
        rewrite: (urlPath: string) => urlPath.replace(/^\/cerebrum-api/, ''),
      },
      // The orchestrator (ADR-029, epic 06) federates search over the pillars
      // and serves `POST /search` at root. The shell's global search panel
      // (`@pops/navigation` useSearchInputData) posts to `/orchestrator-api/search`;
      // strip the prefix so the orchestrator router sees its natural `/search`.
      // Mirrors the `/<pillar>-api` proxies above.
      '/orchestrator-api': {
        target: 'http://localhost:3009',
        changeOrigin: true,
        rewrite: (urlPath: string) => urlPath.replace(/^\/orchestrator-api/, ''),
      },
      // SSE streaming endpoints (ego chat + cerebrum query) live on the
      // cerebrum pillar. These MUST precede the bare `/api` rule below,
      // which otherwise sends every `/api/*` request to core-api (3000).
      '/api/ego': {
        target: 'http://localhost:3007',
        changeOrigin: true,
      },
      '/api/cerebrum': {
        target: 'http://localhost:3007',
        changeOrigin: true,
      },
      '/media/images': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/inventory/documents': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/pillars': {
        // ADR-026 P3: shell-side pillar boot calls GET /pillars and
        // GET /pillars/health on core-api.
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
