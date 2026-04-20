/**
 * Smoke test — Media library list (#2103)
 *
 * Tier 1 minimum: page loads, seeded movies and TV shows are visible,
 * and no uncaught JS error occurs.
 *
 * Seeded media (from seeder.ts):
 *   Movies: The Shawshank Redemption, The Godfather, The Dark Knight, …
 *   TV:     Breaking Bad, Severance, Shogun
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Media — library list smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
    await page.goto('/media');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('renders seeded movies', async ({ page }) => {
    await expect(page.getByText(/Shawshank Redemption/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('renders seeded TV shows', async ({ page }) => {
    await expect(page.getByText(/Breaking Bad/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('page does not crash (no uncaught errors or console errors)', async ({ page }) => {
    // Register BEFORE navigation so errors during first load are captured.
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/media');
    await expect(page.getByText(/Shawshank Redemption/i).first()).toBeVisible({
      timeout: 10_000,
    });

    expect(pageErrors).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
  });
});
