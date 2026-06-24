/**
 * Finance budgets period filter
 *
 * Exercises the period filter on `/finance/budgets` with exact row counts and
 * per-row badge verification against the real API seeded with 8 budgets
 * (7 Monthly + 1 Yearly). Complements the smoke test
 * (`finance-budgets.spec.ts`) — instead of only asserting that a single row is
 * visible/hidden per filter state, this suite asserts the full list is
 * correctly narrowed and restored.
 *
 * Seed snapshot:
 *   Monthly (7): Groceries, Transport, Entertainment, Shopping,
 *                Home & Garden, Utilities, Subscriptions
 *   Yearly  (1): Holiday Fund
 *
 * Filter mechanism:
 *   `BUDGET_TABLE_FILTERS` (pillars/finance/app/src/pages/budgets/columns.tsx)
 *   registers a DataTable `select` filter with options All/Monthly/Yearly. The
 *   underlying `<label>` has no `htmlFor`, so the select is located via a
 *   non-numeric option value (same technique as the Tier 1 test).
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const MONTHLY_CATEGORIES = [
  'Groceries',
  'Transport',
  'Entertainment',
  'Shopping',
  'Home & Garden',
  'Utilities',
  'Subscriptions',
] as const;

const YEARLY_CATEGORIES = ['Holiday Fund'] as const;

const ALL_CATEGORIES = [...MONTHLY_CATEGORIES, ...YEARLY_CATEGORIES];

/**
 * Locate the Period filter <select> by one of its option values. The table's
 * page-size <select> only has numeric options, so any non-numeric value
 * uniquely identifies the Period filter.
 */
function periodFilter(page: Page) {
  return page.locator('select').filter({ has: page.locator('option[value="Monthly"]') });
}

/**
 * Count rows by category. Only data rows are asserted (the table header row
 * does not match any category name).
 */
async function expectVisibleCategories(page: Page, expected: readonly string[]) {
  for (const category of expected) {
    await expect(page.getByRole('row').filter({ hasText: category }).first()).toBeVisible();
  }
}

async function expectHiddenCategories(page: Page, hidden: readonly string[]) {
  for (const category of hidden) {
    await expect(page.getByRole('row').filter({ hasText: category })).toHaveCount(0);
  }
}

test.describe('Finance — budgets period filter (Tier 3)', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    await useRealApi(page);
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/finance/budgets');

    // Wait for the full seeded list so the page-level "8 total budgets"
    // description is available — guarantees subsequent filter flips operate
    // on a fully hydrated table.
    await expect(page.getByText('8 total budgets')).toBeVisible({ timeout: 10_000 });
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

  test('shows all 8 seeded budgets before filtering', async ({ page }) => {
    await expectVisibleCategories(page, ALL_CATEGORIES);
    // "X filter(s) active" only renders when a filter is set; absent on
    // initial load.
    await expect(page.getByText(/\bfilter(s)? active\b/i)).toHaveCount(0);
  });

  test('Monthly filter shows exactly the 7 monthly budgets and hides Holiday Fund', async ({
    page,
  }) => {
    await periodFilter(page).selectOption('Monthly');

    // Active-filter indicator appears.
    await expect(page.getByText('1 filter active')).toBeVisible();

    await expectVisibleCategories(page, MONTHLY_CATEGORIES);
    await expectHiddenCategories(page, YEARLY_CATEGORIES);

    // Every visible data row should carry the Monthly period badge and none
    // the Yearly badge. Scope to <tbody> to skip header/filter chrome.
    const yearlyBadgesInBody = page.locator('tbody').getByRole('row').filter({ hasText: 'Yearly' });
    await expect(yearlyBadgesInBody).toHaveCount(0);

    const monthlyBadgesInBody = page
      .locator('tbody')
      .getByRole('row')
      .filter({ hasText: 'Monthly' });
    await expect(monthlyBadgesInBody).toHaveCount(MONTHLY_CATEGORIES.length);
  });

  test('Yearly filter shows only Holiday Fund and hides all monthly budgets', async ({ page }) => {
    await periodFilter(page).selectOption('Yearly');
    await expect(page.getByText('1 filter active')).toBeVisible();

    await expectVisibleCategories(page, YEARLY_CATEGORIES);
    await expectHiddenCategories(page, MONTHLY_CATEGORIES);

    const monthlyBadgesInBody = page
      .locator('tbody')
      .getByRole('row')
      .filter({ hasText: 'Monthly' });
    await expect(monthlyBadgesInBody).toHaveCount(0);

    const yearlyBadgesInBody = page.locator('tbody').getByRole('row').filter({ hasText: 'Yearly' });
    await expect(yearlyBadgesInBody).toHaveCount(YEARLY_CATEGORIES.length);
  });

  test('switching Monthly → Yearly swaps the list without a manual clear', async ({ page }) => {
    await periodFilter(page).selectOption('Monthly');
    await expectVisibleCategories(page, MONTHLY_CATEGORIES);
    await expectHiddenCategories(page, YEARLY_CATEGORIES);

    // Flip directly to Yearly — the filter should replace, not stack.
    await periodFilter(page).selectOption('Yearly');

    await expectVisibleCategories(page, YEARLY_CATEGORIES);
    await expectHiddenCategories(page, MONTHLY_CATEGORIES);

    // Still exactly one filter active (period, not two).
    await expect(page.getByText('1 filter active')).toBeVisible();
    await expect(page.getByText(/^2 filters active/)).toHaveCount(0);
  });

  test('Clear all restores the full 8-budget list and removes the active-filter indicator', async ({
    page,
  }) => {
    await periodFilter(page).selectOption('Yearly');
    await expectHiddenCategories(page, MONTHLY_CATEGORIES);
    await expect(page.getByText('1 filter active')).toBeVisible();

    await page.getByRole('button', { name: /clear all/i }).click();

    await expectVisibleCategories(page, ALL_CATEGORIES);
    await expect(page.getByText(/\bfilter(s)? active\b/i)).toHaveCount(0);
  });
});
