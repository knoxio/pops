/**
 * Smoke test — Inventory items list (#2102)
 *
 * Tier 1 minimum: page loads, seeded items are visible, the replacement
 * value total is displayed in the summary bar, and no JS crash occurs.
 *
 * Seeded items include:
 *   MacBook Pro 16-inch (replacement: $5,499), Sony WH-1000XM5 Headphones,
 *   Samsung 65" TV, Dyson V15, Breville Barista Express.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Inventory — items list smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
    await page.goto('/inventory');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('renders seeded inventory items', async ({ page }) => {
    await expect(page.getByText(/MacBook Pro/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('displays the replacement value total in the summary bar', async ({ page }) => {
    // SummaryAndView renders: "N items — $X replacement"
    await expect(page.getByText(/replacement/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('page does not crash (no uncaught errors or console errors)', async ({ page }) => {
    // Register BEFORE navigation so errors during first load are captured.
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/inventory');
    await expect(page.getByText(/MacBook Pro/i).first()).toBeVisible({ timeout: 10_000 });

    expect(pageErrors).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
  });
});
