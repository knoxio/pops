/**
 * E2E test — Finance wish list CRUD (#2110)
 *
 * Exercises the full create → confirm → edit priority → confirm → delete → confirm
 * flow at `/finance/wishlist` against the seeded e2e SQLite environment.
 *
 * Design notes:
 *   - Serial describe mode: the three tests share a single created row via a
 *     unique-per-run name to avoid colliding with the 5 seeded items
 *     (New Gaming PC, Standing Desk, Japan Trip, Herman Miller Chair, New Camera).
 *   - Idempotent: a random suffix makes each run unique, and the suite ends by
 *     deleting the item it created. If an earlier test fails, the afterAll hook
 *     attempts a best-effort cleanup so repeated local runs stay clean.
 *   - Semantic locators only — role/name, placeholder, and scoped row filters.
 *     The UI's Select/TextInput labels are visual-only (not linked via htmlFor),
 *     so inputs are targeted by placeholder or by react-hook-form `name=` attr.
 *   - Auto-retrying `expect` handles tRPC invalidation latency.
 *   - pageerror + console-error listeners are registered before navigation and
 *     asserted in afterEach so every test enforces the no-crash requirement.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

// Unique per test run so we don't collide with seeded items or parallel workers.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ITEM_NAME = `E2E Wishlist Item ${RUN_ID}`;

/** Row locator scoped to the item we created for this run. */
function itemRow(page: Page) {
  return page.getByRole('row').filter({ hasText: ITEM_NAME });
}

/** The form dialog (Radix Dialog renders with role="dialog"). */
function formDialog(page: Page) {
  return page.getByRole('dialog');
}

/** The delete confirmation dialog (Radix AlertDialog renders with role="alertdialog"). */
function deleteDialog(page: Page) {
  return page.getByRole('alertdialog');
}

test.describe('Finance — wish list CRUD', () => {
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
    await page.goto('/finance/wishlist');
    // Wait for the list to hydrate so the "Add Item" button is interactive and
    // the DataTable is mounted. The first seeded item always renders.
    await expect(page.getByRole('heading', { name: /wish list/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('row').filter({ hasText: 'New Gaming PC' }).first()).toBeVisible({
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
      await page.goto('/finance/wishlist');
      const row = page.getByRole('row').filter({ hasText: ITEM_NAME });
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
      // Cleanup is best-effort — swallow failures so they don't mask real test failures.
    } finally {
      await page.close();
      await context.close();
    }
  });

  test('creates a new wishlist item and it appears in the list', async ({ page }) => {
    await page.getByRole('button', { name: /add item/i }).click();

    const dialog = formDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/new wishlist item/i)).toBeVisible();

    // TextInput labels aren't linked via htmlFor; use placeholder and name= locators.
    await dialog.getByPlaceholder(/mechanical keyboard/i).fill(ITEM_NAME);
    // Target Amount — react-hook-form registers the input with name="targetAmount".
    await dialog.locator('input[name="targetAmount"]').fill('250');
    // Priority — the only <select> in the dialog.
    await dialog.locator('select').selectOption('Needing');

    await dialog.getByRole('button', { name: /^create$/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    const row = itemRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('Needing');
    await expect(row).toContainText('250');
  });

  test('edits the priority and the updated value displays in the list', async ({ page }) => {
    const row = itemRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('Needing');

    await row.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /edit/i }).click();

    const dialog = formDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/edit item/i)).toBeVisible();

    // Change priority from "Needing" → "Dreaming".
    await dialog.locator('select').selectOption('Dreaming');

    await dialog.getByRole('button', { name: /^update$/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Auto-retrying expect handles tRPC invalidation → refetch latency.
    await expect(row).toContainText('Dreaming', { timeout: 10_000 });
    await expect(row).not.toContainText('Needing');
  });

  test('deletes the item and it is removed from the list', async ({ page }) => {
    const row = itemRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();

    const confirm = deleteDialog(page);
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/permanently delete/i)).toBeVisible();

    await confirm.getByRole('button', { name: /^delete$/i }).click();

    await expect(confirm).not.toBeVisible({ timeout: 10_000 });
    await expect(itemRow(page)).toHaveCount(0, { timeout: 10_000 });
  });
});
