/**
 * Smoke test — Finance budgets list (#2104)
 *
 * Tier 1 minimum: page loads, all 8 seeded budgets are visible, period badges
 * render in table rows, and the Period filter narrows/restores correctly.
 *
 * Seeded budgets:
 *   Monthly: Groceries, Transport, Entertainment, Shopping, Home & Garden,
 *            Utilities, Subscriptions
 *   Yearly:  Holiday Fund
 *
 * Note: the issue specifies a spending progress bar per budget row. That
 * column is not yet implemented in BudgetsPage — amounts are shown but there
 * is no progress indicator against actual spending. This gap is noted in the
 * issue and tracked separately; the test covers what is currently built.
 *
 * Filter selects are identified by a unique non-numeric option value to avoid
 * coupling to DOM order (which includes the page-size <select> in the table
 * footer).
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies the page does not crash (no separate crash test needed).
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

const MONTHLY_BUDGETS = [
  'Groceries',
  'Transport',
  'Entertainment',
  'Shopping',
  'Home & Garden',
  'Utilities',
  'Subscriptions',
];

test.describe('Finance — budgets list smoke test', () => {
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
    await page.goto('/finance/budgets');
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

  test('renders all 8 seeded budgets', async ({ page }) => {
    // Wait for data to load via the first monthly budget.
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // All 7 monthly categories
    for (const category of MONTHLY_BUDGETS) {
      await expect(page.getByRole('row').filter({ hasText: category }).first()).toBeVisible({
        timeout: 5_000,
      });
    }

    // The 1 yearly budget
    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' }).first()).toBeVisible();
  });

  test('table rows show Monthly and Yearly period badges', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Scope to table rows to avoid matching the Period filter <select> options.
    await expect(page.getByRole('row').filter({ hasText: 'Monthly' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Yearly' }).first()).toBeVisible();
  });

  test('Period filter narrows to Yearly only', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await filterSelect(page, 'Yearly').selectOption('Yearly');

    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' })).not.toBeVisible();
  });

  test('Period filter narrows to Monthly only', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await filterSelect(page, 'Monthly').selectOption('Monthly');

    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' })).not.toBeVisible();
  });

  test('clearing Period filter restores all budgets', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await filterSelect(page, 'Yearly').selectOption('Yearly');
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' })).not.toBeVisible();

    await page.getByRole('button', { name: /clear all/i }).click();

    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Holiday Fund' }).first()).toBeVisible();
  });
});
