/**
 * Helpers for routing Playwright browser requests to the real pops-api
 * using the named 'e2e' environment (isolated seeded SQLite DB).
 *
 * How it works:
 *   Browser → /trpc/... → page.route() intercepts → route.fetch() re-sends with ?env=e2e
 *   → Vite proxy → pops-api :3000 → envContextMiddleware → e2e SQLite DB
 *
 * This avoids needing a second API port or changes to vite.config.ts.
 */
import type { Page } from '@playwright/test';

const E2E_ENV = 'e2e';

/**
 * Route ALL tRPC calls through the real API using the e2e environment.
 * Use this in beforeEach for fully integrated tests (no mocks).
 */
export async function useRealApi(page: Page): Promise<void> {
  await page.route('/trpc/**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('env', E2E_ENV);
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });
}

/**
 * Route only a specific tRPC procedure through the real API.
 * All other procedures fall through to whatever mocks are set up.
 *
 * @param pattern - Regex string matching the procedure path, e.g. 'transactions\\.list'
 */
export async function useRealEndpoint(page: Page, pattern: string): Promise<void> {
  await page.route(new RegExp(`/trpc/${pattern}`), async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('env', E2E_ENV);
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });
}
