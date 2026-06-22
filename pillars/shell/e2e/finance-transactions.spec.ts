/**
 * Smoke test — Finance transactions list (#2100)
 *
 * Tier 1 minimum: page loads, seeded rows render, filters narrow the list,
 * and clearing the filter restores the full list.
 *
 * Notes:
 * - Real API against the seeded 'e2e' SQLite environment.
 * - The Account filter dropdown offers static options (ANZ Everyday, ANZ Savings,
 *   Amex, ING Savings, Up Everyday). Seeded transactions use different account
 *   names (Bank Account, Credit Card, Debit Card). Selecting "Amex" therefore
 *   narrows the list to 0 rows — which still confirms the filter mechanism works.
 *   This seeded-data / filter-option mismatch is a pre-existing gap in the
 *   production code, tracked separately.
 * - Filter selects are identified by a unique non-numeric option value to avoid
 *   coupling to DOM order (which includes the page-size <select> in the table
 *   footer).
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

/**
 * Find the native <select> that owns a given option value.
 * The page-size select only has numeric values (10, 25 …) so any non-numeric
 * option value uniquely identifies a filter select.
 */
function filterSelect(page: import('@playwright/test').Page, optionValue: string) {
  return page.locator('select').filter({ has: page.locator(`option[value="${optionValue}"]`) });
}

test.describe('Finance — transactions list smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
    await page.goto('/finance/transactions');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('renders seeded transactions', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('row').filter({ hasText: 'Woolworths Metro' }).first()
    ).toBeVisible();
  });

  test('Account filter narrows the list', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // "Amex" matches no seeded transaction accounts → all rows removed from view.
    // This confirms the filter mechanism works even though seeded account names
    // (Bank Account, Credit Card, …) don't match the dropdown options.
    await filterSelect(page, 'Amex').selectOption('Amex');

    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' })).not.toBeVisible();
  });

  test('clearing Account filter restores the full list', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await filterSelect(page, 'Amex').selectOption('Amex');
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' })).not.toBeVisible();

    await page.getByRole('button', { name: /clear all/i }).click();

    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible();
  });

  test('Type filter narrows to Income rows only', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await filterSelect(page, 'Income').selectOption('Income');

    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Woolworths Metro' })).not.toBeVisible();
  });

  test('clearing Type filter restores the full list', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await filterSelect(page, 'Income').selectOption('Income');
    await expect(page.getByRole('row').filter({ hasText: 'Woolworths Metro' })).not.toBeVisible();

    await page.getByRole('button', { name: /clear all/i }).click();

    await expect(
      page.getByRole('row').filter({ hasText: 'Woolworths Metro' }).first()
    ).toBeVisible();
  });
});
