/**
 * Smoke test — shell loads and app-rail navigation (#2099)
 *
 * Tier 1 minimum: shell root loads, each app-rail icon navigates to the
 * correct route, and the active indicator (aria-current="page") updates.
 *
 * Notes: no tRPC mocking needed. The API is started by Playwright's webServer
 * config and the initialized (empty-schema) database returns empty results.
 * Empty results are handled gracefully by all pages; no crash occurs.
 */
import { expect, test } from '@playwright/test';

test.describe('Shell — app-rail navigation smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Root redirects to /finance — wait for navigation to settle.
    await expect(page).toHaveURL(/\/finance/);
    // App rail renders after the shell mounts — wait for Finance button.
    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
  });

  test('shell root redirects to /finance', async ({ page }) => {
    await expect(page).toHaveURL(/\/finance/);
  });

  test('Finance rail item is active on load', async ({ page }) => {
    const financeBtn = page.getByRole('button', { name: 'Finance' });
    await expect(financeBtn).toHaveAttribute('aria-current', 'page');
  });

  test('navigates to Media and updates active indicator', async ({ page }) => {
    await page.getByRole('button', { name: 'Media' }).click();
    await expect(page).toHaveURL(/\/media/);
    await expect(page.getByRole('button', { name: 'Media' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    // Finance is no longer active
    await expect(page.getByRole('button', { name: 'Finance' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('navigates to Inventory and updates active indicator', async ({ page }) => {
    await page.getByRole('button', { name: 'Inventory' }).click();
    await expect(page).toHaveURL(/\/inventory/);
    await expect(page.getByRole('button', { name: 'Inventory' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('navigates to AI and updates active indicator', async ({ page }) => {
    await page.getByRole('button', { name: 'AI' }).click();
    await expect(page).toHaveURL(/\/ai/);
    await expect(page.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-current', 'page');
  });

  test('navigating back to Finance restores its active indicator', async ({ page }) => {
    // Go to Media first
    await page.getByRole('button', { name: 'Media' }).click();
    await expect(page).toHaveURL(/\/media/);

    // Return to Finance
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
