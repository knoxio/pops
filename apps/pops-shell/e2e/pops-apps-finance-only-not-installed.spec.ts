/**
 * Install-set switching E2E — finance-only build (PRD-101 US-11
 * follow-up, issue #2595).
 *
 * A regression here means an operator-selected install set no longer
 * isolates uninstalled modules behind `NotInstalledPage`, blurring the
 * boundary against the 404 page and breaking the build-time `POPS_APPS`
 * contract.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Shell — POPS_APPS=finance,core install set', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
  });

  test.afterEach(async ({ page }) => {
    // Drain in-flight background tRPC fetches before teardown so a late
    // `route.fetch()` against a closed page does not fail the run.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('navigating to /media renders NotInstalledPage, not 404', async ({ page }) => {
    await page.goto('/media');
    // Asserting one heading visible AND the other absent keeps the
    // not-installed / 404 boundary explicit.
    await expect(page.getByRole('heading', { name: /module not installed/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('navigating to /finance still mounts the installed module', async ({ page }) => {
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
