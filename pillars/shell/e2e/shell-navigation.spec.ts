/**
 * Smoke test — shell loads and app-rail navigation (#2099)
 *
 * Tier 1 minimum: shell root loads, each app-rail icon navigates to the
 * correct route, a page heading is visible, and no uncaught JS error occurs.
 *
 * Real API is routed to the seeded e2e environment (via useRealApi) so tests
 * are isolated from the production database. The e2e DB returns seeded data
 * for all pages; page components also handle empty data gracefully.
 *
 * A pageerror listener is registered in beforeEach and asserted in afterEach
 * so every test in this suite enforces the no-crash requirement.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Shell — app-rail navigation smoke test', () => {
  test.describe.configure({ mode: 'serial' });

  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    await useRealApi(page);
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    // Root redirects to /finance — wait for navigation to settle.
    await expect(page).toHaveURL(/\/finance/);
    // App rail renders after the shell mounts — wait for Finance button.
    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test('shell root redirects to /finance and shows a heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('Finance rail item is active on load', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('navigates to Media — updates URL, active indicator, and shows a heading', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Media' }).click();
    await expect(page).toHaveURL(/\/media/);
    await expect(page.getByRole('button', { name: 'Media' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('button', { name: 'Finance' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('navigates to Inventory — updates URL, active indicator, and shows a heading', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Inventory' }).click();
    await expect(page).toHaveURL(/\/inventory/);
    await expect(page.getByRole('button', { name: 'Inventory' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  });

  test('navigates to Cerebrum — updates URL, active indicator, and shows a heading', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Cerebrum', exact: true }).click();
    await expect(page).toHaveURL(/\/cerebrum/);
    await expect(page.getByRole('button', { name: 'Cerebrum', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('navigating back to Finance restores its active indicator', async ({ page }) => {
    await page.getByRole('button', { name: 'Media' }).click();
    await expect(page).toHaveURL(/\/media/);

    await page.getByRole('button', { name: 'Finance' }).click();
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('button', { name: 'Media' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
