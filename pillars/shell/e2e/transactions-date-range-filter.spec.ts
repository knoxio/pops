/**
 * Tier 3 — Finance transactions date range filter (#2124)
 *
 * Exercises the date range filter on `/finance/transactions` against the real
 * API seeded with 16 transactions (see `apps/pops-api/src/db/seeder.ts`).
 *
 * Filter mechanism:
 *   `TRANSACTION_TABLE_FILTERS` (pillars/finance/app/src/pages/transactions/columns.tsx)
 *   registers a DataTable `daterange` filter on the `date` column. The filter
 *   renders two `<input type="date">` controls (placeholders "From" / "To"),
 *   wired to the shared `dateRangeFilter` fn from `@pops/ui`.
 *
 * Seeded date snapshot (Feb 2026 window picked for visible subset):
 *   In-window  (2026-02-05 .. 2026-02-10): Woolworths Metro (02-10),
 *                                          Coles Local (02-08),
 *                                          Shell Service Station (02-07),
 *                                          Netflix Subscription (02-05).
 *   Out-of-window: every other seeded txn (Salary 02-01, Spotify 02-01,
 *                                          JB Hi-Fi 02-02, Woolworths 02-03,
 *                                          Amazon 02-04, Transfers 02-01,
 *                                          Bunnings 01-30, Shell Coles Express 01-28,
 *                                          Salary 01-18 / 01-04,
 *                                          Woolworths 2025-12-28).
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

/**
 * Descriptions of transactions that fall WITHIN 2026-02-05..2026-02-10 (inclusive).
 * Selected to give a 4-row subset that excludes most seeded rows.
 */
const IN_WINDOW_DESCRIPTIONS = [
  'Woolworths Metro', // 2026-02-10
  'Coles Local', // 2026-02-08
  'Shell Service Station', // 2026-02-07
  'Netflix Subscription', // 2026-02-05
] as const;

/**
 * Sample of descriptions guaranteed to be OUTSIDE the 2026-02-05..2026-02-10
 * window. Spans before, between, and well after to catch off-by-one bugs.
 */
const OUT_OF_WINDOW_DESCRIPTIONS = [
  'Spotify Premium', // 2026-02-01 — just before window
  'Bunnings Warehouse', // 2026-01-30 — Jan
  'Shell Coles Express', // 2026-01-28 — Jan
] as const;

const FROM_DATE = '2026-02-05';
const TO_DATE = '2026-02-10';

function fromInput(page: Page) {
  return page.getByPlaceholder('From').first();
}

function toInput(page: Page) {
  return page.getByPlaceholder('To').first();
}

/**
 * Returns a row locator matching a transaction by description text. Uses the
 * tbody scope so header/filter chrome can never satisfy the assertion.
 */
function txnRow(page: Page, description: string) {
  return page.locator('tbody').getByRole('row').filter({ hasText: description });
}

async function expectVisibleDescriptions(page: Page, expected: readonly string[]) {
  for (const description of expected) {
    await expect(txnRow(page, description).first()).toBeVisible();
  }
}

async function expectHiddenDescriptions(page: Page, hidden: readonly string[]) {
  for (const description of hidden) {
    await expect(txnRow(page, description)).toHaveCount(0);
  }
}

test.describe('Finance — transactions date range filter (Tier 3)', () => {
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
    await page.goto('/finance/transactions');

    // Wait for the seeded list to hydrate before any filter interaction.
    await expect(page.getByRole('row').filter({ hasText: 'Salary Payment' }).first()).toBeVisible({
      timeout: 10_000,
    });
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

  test('renders the date range From/To inputs', async ({ page }) => {
    await expect(fromInput(page)).toBeVisible();
    await expect(toInput(page)).toBeVisible();
    // No filter active until the user enters a date.
    await expect(page.getByText(/\bfilter(s)? active\b/i)).toHaveCount(0);
  });

  test('applying a date range narrows the list to the in-window subset', async ({ page }) => {
    await fromInput(page).fill(FROM_DATE);
    await toInput(page).fill(TO_DATE);

    await expect(page.getByText('1 filter active')).toBeVisible();

    await expectVisibleDescriptions(page, IN_WINDOW_DESCRIPTIONS);
    await expectHiddenDescriptions(page, OUT_OF_WINDOW_DESCRIPTIONS);
  });

  test('From-only bound hides earlier transactions and keeps later ones', async ({ page }) => {
    await fromInput(page).fill('2026-02-05');

    await expect(page.getByText('1 filter active')).toBeVisible();

    // Anything on/after 2026-02-05 stays visible (sample: in-window rows).
    await expectVisibleDescriptions(page, IN_WINDOW_DESCRIPTIONS);
    // Earlier rows must be gone.
    await expectHiddenDescriptions(page, [
      'Bunnings Warehouse', // 2026-01-30
      'Shell Coles Express', // 2026-01-28
    ]);
  });

  test('To-only bound hides later transactions and keeps earlier ones', async ({ page }) => {
    await toInput(page).fill('2026-01-31');

    await expect(page.getByText('1 filter active')).toBeVisible();

    // Jan rows survive.
    await expectVisibleDescriptions(page, ['Bunnings Warehouse', 'Shell Coles Express']);
    // Feb rows gone.
    await expectHiddenDescriptions(page, IN_WINDOW_DESCRIPTIONS);
  });

  test('Clear all resets the date range and restores the full list', async ({ page }) => {
    await fromInput(page).fill(FROM_DATE);
    await toInput(page).fill(TO_DATE);
    await expectHiddenDescriptions(page, OUT_OF_WINDOW_DESCRIPTIONS);
    await expect(page.getByText('1 filter active')).toBeVisible();

    await page.getByRole('button', { name: /clear all/i }).click();

    // Inputs cleared.
    await expect(fromInput(page)).toHaveValue('');
    await expect(toInput(page)).toHaveValue('');

    // Active-filter indicator gone.
    await expect(page.getByText(/\bfilter(s)? active\b/i)).toHaveCount(0);

    // Previously hidden rows are visible again, alongside the in-window subset.
    await expectVisibleDescriptions(page, [
      ...IN_WINDOW_DESCRIPTIONS,
      ...OUT_OF_WINDOW_DESCRIPTIONS,
    ]);
  });
});
