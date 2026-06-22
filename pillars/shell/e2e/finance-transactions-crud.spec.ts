/**
 * E2E test — Finance transactions CRUD (#2106)
 *
 * Exercises the full create → confirm → edit (amount + entity) → confirm →
 * delete → confirm flow at `/finance/transactions` against the seeded e2e
 * SQLite environment.
 *
 * Design notes
 * ------------
 * - Serial describe mode: the three tests share a single transaction created
 *   by the first test, edited by the second, deleted by the third.
 * - Idempotent: a unique-per-run description avoids collisions with the 16
 *   seeded transactions and with parallel workers. The afterAll hook attempts
 *   a best-effort cleanup so repeated local runs stay clean even if a test
 *   bails out mid-flight.
 * - Semantic locators only — role/name, placeholder, scoped row filters.
 *   `TextInput` labels are visual-only (not linked via htmlFor), so inputs
 *   are targeted by placeholder or by react-hook-form `name=` attr.
 * - Auto-retrying `expect` handles tRPC invalidation latency.
 * - pageerror + console-error listeners are registered before navigation and
 *   asserted in afterEach so every test enforces the no-crash requirement.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

// Unique per test run so we don't collide with seeded items or parallel workers.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DESCRIPTION = `E2E Txn ${RUN_ID}`;
const INITIAL_AMOUNT = '-12.34';
const UPDATED_AMOUNT = '-99.99';
const ACCOUNT = 'E2E CRUD';

/** Row locator scoped to the transaction we created for this run. */
function targetRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: DESCRIPTION });
}

/** The form dialog (Radix Dialog renders with role="dialog"). */
function formDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

/** The delete confirmation dialog (Radix AlertDialog renders with role="alertdialog"). */
function deleteDialog(page: Page): Locator {
  return page.getByRole('alertdialog');
}

/**
 * Fill the form fields. The form is brand-new for create flows, partially
 * pre-populated for edit flows; only the fields passed in `fields` are filled
 * (or replaced). Empty-string values clear an existing field first.
 */
async function fillForm(
  dialog: Locator,
  fields: { date?: string; amount?: string; description?: string; account?: string }
) {
  if (fields.date !== undefined) {
    const date = dialog.locator('input[name="date"]');
    await date.fill(fields.date);
  }
  if (fields.amount !== undefined) {
    const amount = dialog.locator('input[name="amount"]');
    await amount.fill(fields.amount);
  }
  if (fields.description !== undefined) {
    const description = dialog.locator('input[name="description"]');
    await description.fill(fields.description);
  }
  if (fields.account !== undefined) {
    const account = dialog.locator('input[name="account"]');
    await account.fill(fields.account);
  }
}

test.describe('Finance — transactions CRUD', () => {
  test.describe.configure({ mode: 'serial' });

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
    // Wait for the list to hydrate so the "Add Transaction" button is
    // interactive and the DataTable is mounted. The first seeded row always
    // renders.
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('row').filter({ hasText: 'Coles Local' }).first()).toBeVisible({
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

  // Best-effort cleanup: if a test above bailed out, navigate back in and
  // remove the leftover row so repeat runs stay deterministic.
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await useRealApi(page);
      await page.goto('/finance/transactions');
      const row = page.getByRole('row').filter({ hasText: DESCRIPTION });
      if (
        await row
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await row
          .first()
          .getByRole('button', { name: /actions/i })
          .click();
        await page.getByRole('menuitem', { name: /delete/i }).click();
        const confirm = page.getByRole('alertdialog').getByRole('button', { name: /^delete$/i });
        await confirm.click();
        await expect(row).toHaveCount(0, { timeout: 5_000 });
      }
    } catch {
      // Cleanup is best-effort — swallow failures so they don't mask real test
      // failures.
    } finally {
      await page.close();
      await context.close();
    }
  });

  test('creates a new transaction and it appears in the list', async ({ page }) => {
    await page.getByRole('button', { name: /add transaction/i }).click();

    const dialog = formDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/new transaction/i)).toBeVisible();

    await fillForm(dialog, {
      date: '2026-04-26',
      amount: INITIAL_AMOUNT,
      description: DESCRIPTION,
      account: ACCOUNT,
    });
    // Type — the only <select> in the dialog (Type field).
    await dialog.locator('select').selectOption('Expense');

    await dialog.getByRole('button', { name: /^create$/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    const row = targetRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(ACCOUNT);
    // Amount column renders -$12.34 (sign prefix + absolute value).
    await expect(row).toContainText('12.34');
  });

  test('edits the amount and entity and the list reflects the new values', async ({ page }) => {
    const row = targetRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('12.34');

    await row.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /edit/i }).click();

    const dialog = formDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/edit transaction/i)).toBeVisible();

    // Update the amount.
    await fillForm(dialog, { amount: UPDATED_AMOUNT });

    // Pick an entity via the EntitySelect combobox. The seeded e2e DB has
    // "Woolworths" as the first entity. The form contains two role="combobox"
    // elements (the type <select> and the entity Popover trigger) — scope to
    // the entity trigger by its placeholder so strict mode resolves to one.
    await dialog.getByRole('combobox').filter({ hasText: 'Choose entity' }).click();
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover).toBeVisible();
    await popover
      .getByRole('option')
      .filter({ hasText: /^Woolworths/ })
      .first()
      .click();
    // Popover closes on selection.
    await expect(popover).toHaveCount(0);

    await dialog.getByRole('button', { name: /^update$/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Auto-retrying expect handles tRPC invalidation → refetch latency. The
    // entityName renders below the description in the same row.
    await expect(row).toContainText('99.99', { timeout: 10_000 });
    await expect(row).toContainText('Woolworths');
    await expect(row).not.toContainText('12.34');
  });

  test('deletes the transaction and it is removed from the list', async ({ page }) => {
    const row = targetRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();

    const confirm = deleteDialog(page);
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/undo from the toast/i)).toBeVisible();

    await confirm.getByRole('button', { name: /^delete$/i }).click();

    await expect(confirm).not.toBeVisible({ timeout: 10_000 });
    await expect(targetRow(page)).toHaveCount(0, { timeout: 10_000 });
  });
});
