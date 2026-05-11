/**
 * Install-set boundary E2E (PRD-101 US-11).
 *
 * Why 404 vs NotInstalledPage matter as distinct surfaces: operators must
 * be able to tell a typo from an excluded module at a glance. Full
 * install-set switching across two shell builds is deferred — the install
 * set is baked into `MODULES` at registry build time, so two-suite
 * switching needs harness changes (see the linked US doc).
 *
 * The known-but-not-installed boundary is exercised here via `/ego`: the
 * `ego` module is in `KNOWN_MODULES` but exposes only an overlay surface
 * (no `frontend.routes`), so the router never mounts `/ego/*` and the
 * catch-all fires.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Shell — install-set boundary', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
  });

  test('navigating to an unknown URL renders the 404 page', async ({ page }) => {
    await page.goto('/totally-not-a-module-id-1234567890');
    await expect(page.getByRole('heading', { name: /not found|404/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /module not installed/i })).toHaveCount(0);
  });

  test('navigating to a known module without routes renders NotInstalledPage', async ({ page }) => {
    await page.goto('/ego');
    await expect(page.getByRole('heading', { name: /module not installed/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('navigating to an installed module root renders that module', async ({ page }) => {
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
