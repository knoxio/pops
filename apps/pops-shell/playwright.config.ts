import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for POPS Shell E2E tests
 *
 * Two modes:
 *   Mocked tests (transactions.spec.ts, import-wizard.spec.ts):
 *     All API calls are intercepted via page.route() — fast, no real backend needed.
 *     The API webServer is still started but irrelevant for these tests.
 *
 *   Integration tests (*-integration.spec.ts):
 *     Real API calls route through Vite proxy → backend API → 'e2e' named environment.
 *     globalSetup creates the seeded env before tests; globalTeardown deletes it after.
 */
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
    // E2E server runs on 5567 (separate from dev server on 5566) so VITE_E2E=true
    // is always active and ReactQueryDevtools never renders.
    baseURL: 'http://localhost:5567',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    // Vite dev server (Shell) — runs on port 5567 (separate from dev server on 5566)
    // so VITE_E2E=true always takes effect regardless of whether a dev server is running.
    // ReactQueryDevtools SVG logo renders at r=316.5px and intercepts pointer events,
    // so it must be disabled in E2E via VITE_E2E=true.
    {
      command: 'pnpm dev --port 5567',
      url: 'http://localhost:5567',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { VITE_E2E: 'true' },
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
