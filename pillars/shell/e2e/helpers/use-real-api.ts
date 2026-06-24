/**
 * Helpers for routing Playwright browser requests to the named 'e2e'
 * environment (an isolated seeded SQLite DB selected via the `?env=e2e`
 * query param). The helpers intercept matching requests with `page.route`,
 * re-fetch them with `env` appended, and fulfil the browser with the result.
 *
 * The API surface these helpers target no longer exists: this suite was
 * written against the deleted `apps/pops-api` tRPC monolith and is gated to
 * `workflow_dispatch` only (see playwright.config.ts) pending a rewrite
 * against the REST pillars.
 */
import type { Page } from '@playwright/test';

const E2E_ENV = 'e2e';

/**
 * Route every matched request through the real API using the e2e
 * environment. Use this in beforeEach for fully integrated tests (no mocks).
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
 * Route only requests matching `pattern` through the real API. Everything
 * else falls through to whatever mocks are set up.
 *
 * @param pattern - Regex string matching the request path, e.g. 'transactions\\.list'
 */
export async function useRealEndpoint(page: Page, pattern: string): Promise<void> {
  await page.route(new RegExp(`/trpc/${pattern}`), async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('env', E2E_ENV);
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });
}
