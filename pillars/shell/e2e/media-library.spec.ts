/**
 * Smoke test — Media library list (#2103)
 *
 * Tier 1 minimum: page loads, seeded movies and TV shows are visible,
 * and no uncaught JS error occurs.
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies the page does not crash (no separate crash test needed).
 *
 * Seeded media (from seeder.ts):
 *   Movies: Interstellar, The Dark Knight, The Godfather, … (alphabetical; page 1 of 2)
 *   TV:     Breaking Bad, Severance, Shogun
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Media — library list smoke test', () => {
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
    await page.goto('/media');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        // WebKit logs failed <img> loads (e.g. poster images) as console.error.
        // The e2e image cache is not populated during seeding, so 404s are expected.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('renders seeded movies', async ({ page }) => {
    await expect(page.getByText(/Interstellar/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('renders seeded TV shows', async ({ page }) => {
    await expect(page.getByText(/Breaking Bad/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
