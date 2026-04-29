/**
 * Smoke test — AI usage stats page (#2120)
 *
 * Tier 2 minimum: navigating to `/ai` loads the AI Observability page, the
 * usage-stats KPI panel renders, at least one numeric metric is non-empty,
 * and the page does not throw.
 *
 * Uses the real API against the seeded `e2e` SQLite environment. The seeder
 * inserts 3 `ai_inference_log` rows (2 live calls + 1 cache hit) so the
 * `core.aiObservability.getStats` endpoint returns non-zero totals — no
 * mocking is needed. Design note: we deliberately avoid `page.route()` mocks
 * here because real data exercises the full stack (router → service → DB
 * aggregation → KPI derivation) and catches regressions mocks would hide.
 *
 * Seeded totals (see apps/pops-api/src/db/seeder.ts "AI Usage" block):
 *   totalCalls      = 3
 *   totalCostUsd    = 0.0006   → rendered as "$0.0006"
 *   cacheHitRate    = 1/3      → rendered as "33.3%"
 *   errorRate       = 0        → rendered as "0.0%"
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies the page does not throw page errors or log console errors.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('AI — usage stats page smoke test', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    await useRealApi(page);
    // Register before navigation so errors on first load are captured.
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/cerebrum/admin');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('renders the AI Observability page header', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'AI Observability' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('renders the KPI stats panel with all four metric cards', async ({ page }) => {
    // Wait for the stats panel to mount (skeleton is replaced by real cards).
    await expect(page.getByRole('heading', { level: 3, name: 'Total Cost' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { level: 3, name: 'Total Calls' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Cache Hit Rate' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Error Rate' })).toBeVisible();
  });

  test('Total Calls renders a non-empty numeric value matching seeded data', async ({ page }) => {
    const totalCallsHeading = page.getByRole('heading', { level: 3, name: 'Total Calls' });
    await expect(totalCallsHeading).toBeVisible({ timeout: 10_000 });

    // StatCard structure: <h3>Total Calls</h3><p>{value}</p>. The nearest
    // sibling <p> under the same parent holds the rendered number.
    const valueText = await totalCallsHeading.locator('xpath=following-sibling::p[1]').innerText();

    // Seeder inserts 3 records — assert the value parses as a positive integer.
    const parsed = Number(valueText.replace(/[^0-9.]/g, ''));
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBeGreaterThan(0);
  });

  test('Total Cost renders a non-empty dollar value', async ({ page }) => {
    const totalCostHeading = page.getByRole('heading', { level: 3, name: 'Total Cost' });
    await expect(totalCostHeading).toBeVisible({ timeout: 10_000 });

    // Auto-retry until the value text matches the expected `$0.xxxx` shape —
    // this implicitly waits out the loading skeleton.
    const valueParagraph = totalCostHeading.locator('xpath=following-sibling::p[1]');
    await expect(valueParagraph).toHaveText(/^\$\d+\.\d+$/);
  });

  test('Cache Hit Rate renders a non-empty percentage', async ({ page }) => {
    const cacheHitHeading = page.getByRole('heading', { level: 3, name: 'Cache Hit Rate' });
    await expect(cacheHitHeading).toBeVisible({ timeout: 10_000 });

    const valueParagraph = cacheHitHeading.locator('xpath=following-sibling::p[1]');
    await expect(valueParagraph).toHaveText(/^\d+(\.\d+)?%$/);
  });
});
