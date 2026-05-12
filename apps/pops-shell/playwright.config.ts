import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright configuration for POPS Shell E2E tests.
 *
 * Two modes:
 *   Mocked tests (transactions.spec.ts, import-wizard.spec.ts):
 *     All API calls are intercepted via page.route() — fast, no real backend needed.
 *     The API webServer is still started but irrelevant for these tests.
 *
 *   Integration tests (*-integration.spec.ts):
 *     Real API calls route through Vite proxy → backend API → 'e2e' named environment.
 *     globalSetup creates the seeded env before tests; globalTeardown deletes it after.
 *
 * Install-set switching (PRD-101 US-11 follow-up, issue #2595):
 *
 *   The shell consumes `MODULES` from `@pops/module-registry` at build
 *   time. To exercise the install-set boundary across two distinct shell
 *   builds in a single `pnpm test:e2e` run, this config defines two
 *   Playwright projects, each backed by its own `webServer`:
 *
 *     • `chromium-all-modules` (port 5567) — boots the shell against the
 *       canonical workspace registry (every known module installed).
 *     • `chromium-finance-only` (port 5569) — boots the shell against a
 *       pre-built registry snapshot generated with `POPS_APPS=finance,core`.
 *       The snapshot lives under `.e2e/registry/finance-only.js`; the
 *       Vite config picks it up via `POPS_REGISTRY_SNAPSHOT` and aliases
 *       `@pops/module-registry` to it for that server only.
 *
 *   Both servers share the same pops-api (port 3000) — the API does not
 *   participate in this switching matrix.
 */
const FINANCE_ONLY_SNAPSHOT = path.resolve(HERE, '.e2e/registry/finance-only.js');
const ALL_MODULES_PORT = 5567;
const FINANCE_ONLY_PORT = 5569;

const SHELL_E2E_ENV = { VITE_E2E: 'true' } as const;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html']] : 'html',

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    // Default baseURL targets the all-modules shell. Each project overrides
    // it where the test must run against a different install set.
    baseURL: `http://localhost:${ALL_MODULES_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Default project — runs every spec EXCEPT the finance-only suite,
      // which requires a shell built with `POPS_APPS=finance,core`.
      name: 'chromium-all-modules',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${ALL_MODULES_PORT}`,
      },
      testIgnore: ['**/pops-apps-finance-only-*.spec.ts'],
    },
    {
      // Restricted install set — only the specs that assert the
      // POPS_APPS=finance,core boundary run here. Keeping them isolated to
      // a dedicated project avoids paying the snapshot-build cost on every
      // unrelated spec.
      name: 'chromium-finance-only',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${FINANCE_ONLY_PORT}`,
      },
      testMatch: ['**/pops-apps-finance-only-*.spec.ts'],
    },
  ],

  webServer: [
    // All-modules shell — canonical workspace registry, no overrides.
    // ReactQueryDevtools SVG logo renders at r=316.5px and intercepts
    // pointer events, so it must be disabled in E2E via VITE_E2E=true.
    {
      command: `pnpm dev --port ${ALL_MODULES_PORT}`,
      url: `http://localhost:${ALL_MODULES_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { ...SHELL_E2E_ENV },
    },
    // Finance-only shell — registry snapshot is built first, then Vite
    // boots with `POPS_REGISTRY_SNAPSHOT` pointing at the snapshot file.
    // Sequencing within this single shell command is critical: the
    // snapshot must exist on disk before Vite resolves the alias, so the
    // build step runs synchronously before `pnpm dev` is spawned.
    {
      command: `pnpm tsx scripts/build-registry-snapshot.ts ${FINANCE_ONLY_SNAPSHOT} && pnpm dev --port ${FINANCE_ONLY_PORT}`,
      url: `http://localhost:${FINANCE_ONLY_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
      env: {
        ...SHELL_E2E_ENV,
        POPS_APPS: 'finance,core',
        POPS_REGISTRY_SNAPSHOT: FINANCE_ONLY_SNAPSHOT,
      },
    },
    // Finance API — required for integration tests; mocked tests don't use it but starting
    // it is harmless and ensures the proxy target is always available.
    //
    // INVENTORY_IMAGES_DIR is required by inventory.photos.upload (no default, unlike
    // MEDIA_IMAGES_DIR). Setting it here keeps the inventory photo e2e tests (#2125)
    // self-contained — uploads are written under a per-process tmp dir that the test
    // teardown cleans up alongside the e2e SQLite environment.
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000/health',
      cwd: '../pops-api',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: { INVENTORY_IMAGES_DIR: './data/e2e/inventory-images' },
    },
  ],
});
