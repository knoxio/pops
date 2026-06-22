/**
 * Smoke test — Inventory items list (#2102)
 *
 * Tier 1 minimum: page loads, seeded items are visible, the replacement
 * value total is displayed in the summary bar, and no JS crash occurs.
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies the page does not crash (no separate crash test needed).
 *
 * Seeded items include:
 *   MacBook Pro 16-inch (replacement: $5,499), Sony WH-1000XM5 Headphones,
 *   Samsung 65" TV, Dyson V15, Breville Barista Express.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Inventory — items list smoke test', () => {
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
    await page.goto('/inventory');
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

  test('renders seeded inventory items', async ({ page }) => {
    await expect(page.getByText(/MacBook Pro/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('displays the replacement value total in the summary bar', async ({ page }) => {
    // SummaryAndView renders: "N items — $X replacement"
    await expect(page.getByText(/replacement/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
