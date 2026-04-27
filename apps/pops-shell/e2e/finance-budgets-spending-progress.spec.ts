/**
 * E2E — Finance budgets spending progress (#2108 / #2186)
 *
 * Tier 2 flow: prove the freshly-built `Spent` / `% Progress` columns light
 * up after a matching transaction is created, end-to-end against the seeded
 * `e2e` SQLite environment.
 *
 * Steps:
 *   1. Navigate to /finance/budgets and confirm the page loads.
 *   2. Open the Add Budget dialog and create a brand-new monthly budget for
 *      a uniquely-named category (so we never collide with one of the 8
 *      seeded budgets, which use stable names like Groceries / Transport).
 *   3. Confirm the new budget renders with a 0% progress (no transactions
 *      yet match its category tag).
 *   4. Create a matching transaction directly via the tRPC create mutation
 *      against the same `e2e` env (the transactions list page does not yet
 *      expose a CRUD UI — see in-flight branch #2185 for the matching
 *      front-end work). The transaction is dated today so it falls inside
 *      the Monthly MTD window the API computes.
 *   5. Reload /finance/budgets and assert the new budget's row now shows a
 *      non-zero `%` and a non-zero `$` Spent amount.
 *   6. Delete the budget via the row-level Delete action and confirm the
 *      row vanishes.
 *
 * Cleanup:
 *   The matching transaction is created against the long-lived `e2e` env,
 *   so `afterEach` removes it (and any leftover budget) so re-runs start
 *   from the same seeded baseline.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const API_URL = process.env['FINANCE_API_URL'] ?? 'http://localhost:3000';
const ENV_NAME = 'e2e';

/**
 * Generate a category that is guaranteed unique across runs and across the
 * seeded budgets/transactions. Including a timestamp + random suffix avoids
 * any collision with existing data, which matters because the budgets
 * `(category, period)` index is unique.
 */
function uniqueCategory(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `E2E-Spend-${stamp}-${rand}`;
}

/** Today as `YYYY-MM-DD` (UTC) — matches the API's MTD window exactly. */
function todayISO(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface CreatedTransaction {
  id: string;
}

interface TrpcResponse<T> {
  result: { data: { data: T } };
}

interface ListTransactionsResponse {
  result: { data: { data: { id: string }[] } };
}

/** Create a transaction in the `e2e` env via the tRPC create mutation. */
async function createMatchingTransaction(
  request: APIRequestContext,
  category: string
): Promise<CreatedTransaction> {
  const res = await request.post(`${API_URL}/trpc/finance.transactions.create?env=${ENV_NAME}`, {
    data: {
      description: `E2E spend ${category}`,
      account: 'E2E Account',
      amount: -123.45,
      date: todayISO(),
      type: 'Expense',
      tags: [category],
    },
  });
  if (!res.ok()) {
    throw new Error(`createMatchingTransaction failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as TrpcResponse<{ id: string }>;
  return { id: body.result.data.data.id };
}

/** Best-effort delete of a transaction id; never throws to avoid masking the test failure. */
async function deleteTransactionSafely(request: APIRequestContext, id: string): Promise<void> {
  try {
    await request.post(`${API_URL}/trpc/finance.transactions.delete?env=${ENV_NAME}`, {
      data: { id },
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Best-effort cleanup that scrubs any transactions matching our unique
 * category tag — protects subsequent runs from a transaction left behind by
 * a prematurely-failed test.
 */
async function purgeTransactionsByTag(request: APIRequestContext, category: string): Promise<void> {
  const input = encodeURIComponent(JSON.stringify({ tag: category, limit: 100 }));
  const res = await request.get(
    `${API_URL}/trpc/finance.transactions.list?env=${ENV_NAME}&input=${input}`
  );
  if (!res.ok()) return;
  const body = (await res.json()) as ListTransactionsResponse;
  const ids = body.result.data.data.map((t) => t.id);
  for (const id of ids) {
    await deleteTransactionSafely(request, id);
  }
}

/** Find the table row for a budget category. */
function budgetRow(page: Page, category: string) {
  return page.getByRole('row').filter({ hasText: category });
}

test.describe('Finance — budgets spending progress (#2108 / #2186)', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];
  let category = '';

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    category = uniqueCategory();
    await useRealApi(page);
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
  });

  test.afterEach(async ({ page, request }) => {
    // Delete any transactions we created against our unique tag so other
    // specs and future runs are unaffected.
    await purgeTransactionsByTag(request, category);
    // Best-effort row delete — if the budget is still on the page, kill it.
    try {
      await page.goto('/finance/budgets');
      const row = budgetRow(page, category).first();
      if (await row.isVisible().catch(() => false)) {
        await row.getByRole('button', { name: 'Actions' }).click();
        await page.getByRole('menuitem', { name: /Delete/i }).click();
        await page
          .getByRole('button', { name: /Delete/i })
          .last()
          .click();
      }
    } catch {
      /* best-effort cleanup */
    }
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

  test('create monthly budget, add matching transaction, verify non-zero spending progress, delete', async ({
    page,
    request,
  }) => {
    // ---- Step 1: navigate ------------------------------------------------
    await page.goto('/finance/budgets');
    await expect(page.getByRole('heading', { name: 'Budgets', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    // Wait for the seeded list to render so the "Add Budget" button is interactive.
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // ---- Step 2: create a Monthly budget for our unique category ---------
    await page.getByRole('button', { name: /Add Budget/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Category — TextInput placeholder is "e.g. Groceries, Entertainment".
    await dialog.getByPlaceholder(/Groceries, Entertainment/i).fill(category);
    // Period — native <select>; "Monthly" identifies it uniquely.
    await dialog
      .locator('select')
      .filter({ has: page.locator('option[value="Monthly"]') })
      .first()
      .selectOption('Monthly');
    // Amount — TextInput with type=number, placeholder "0.00".
    await dialog.getByPlaceholder('0.00').fill('500');

    await dialog.getByRole('button', { name: /^Create$/ }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // ---- Step 3: confirm the row exists with 0% progress -----------------
    const row = budgetRow(page, category).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('0%')).toBeVisible();

    // ---- Step 4: create a matching transaction via the API ---------------
    // The transactions list page has no create UI yet (#2185), so we POST
    // straight to the tRPC procedure under the same `e2e` env.
    const txn = await createMatchingTransaction(request, category);
    expect(txn.id).toBeTruthy();

    // ---- Step 5: navigate via /finance/transactions then back, assert non-zero
    await page.goto('/finance/transactions');
    await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto('/finance/budgets');
    const refreshedRow = budgetRow(page, category).first();
    await expect(refreshedRow).toBeVisible({ timeout: 10_000 });

    // The seeded amount is $123.45 against a $500 budget → ~25%. We assert
    // both that the percentage is non-zero (acceptance criterion) and that
    // the spent amount appears in the row.
    await expect(refreshedRow).not.toContainText('0%');
    await expect(refreshedRow).toContainText(/\$123\.45/);
    await expect(refreshedRow).toContainText(/%/);

    // ---- Step 6: delete the budget via the row's Actions menu ------------
    await refreshedRow.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: /Delete/i }).click();
    // The DeleteBudgetDialog has a destructive Delete confirmation button.
    await page
      .getByRole('button', { name: /Delete/i })
      .last()
      .click();

    await expect(budgetRow(page, category)).toHaveCount(0, { timeout: 10_000 });
  });
});
