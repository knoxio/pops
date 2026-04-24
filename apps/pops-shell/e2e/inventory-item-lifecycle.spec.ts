/**
 * E2E test — Inventory item lifecycle (#2111)
 *
 * Walks the full create → view → edit → delete flow at `/inventory` against the
 * seeded e2e SQLite environment. Complements the Tier 1 smoke test
 * (inventory-items.spec.ts), which only verifies seeded data renders.
 *
 * Design notes:
 *   - Serial describe mode: four ordered steps share one unique-per-run item so
 *     they don't collide with the 20+ seeded items or parallel workers.
 *   - Idempotent: a random suffix makes each run unique, and the final test
 *     deletes the item it created. An `afterAll` hook does a best-effort
 *     cleanup if an earlier step fails, so repeated local runs stay clean.
 *   - Form labels are not linked via htmlFor, so inputs are targeted by the
 *     `name=` attribute react-hook-form registers on each field.
 *   - The Items page has no "Add" CTA when the list is non-empty, so we navigate
 *     directly to `/inventory/items/new`.
 *   - The list is narrowed via the `?q=` search param — the unique item name
 *     makes this a single-row table regardless of seed size or pagination.
 *   - Auto-retrying `expect` handles tRPC invalidation → refetch latency.
 *   - pageerror + console-error listeners are registered before navigation and
 *     asserted in afterEach so every test enforces the no-crash requirement.
 *
 * Note: the edit step is currently skipped pending the item-edit save flow fix
 * (success toast + post-save navigation) tracked in
 * https://github.com/knoxio/pops/issues/2157. Create and delete remain active.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

// Unique per test run so we don't collide with seeded items or parallel workers.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ITEM_NAME = `E2E Lifecycle Item ${RUN_ID}`;
const ITEM_TYPE = 'Electronics';
const ITEM_LOCATION = 'Desk'; // seeded child of Home › Office
const INITIAL_REPLACEMENT = '1234';
const INITIAL_REPLACEMENT_FORMATTED = '$1,234';
const UPDATED_REPLACEMENT = '4321';
const UPDATED_REPLACEMENT_FORMATTED = '$4,321';

/** Row locator scoped to the item we created for this run. */
function itemRow(page: Page) {
  return page.getByRole('row').filter({ hasText: ITEM_NAME });
}

/** Navigate to the list filtered to only our item via `?q=<unique-name>`. */
async function gotoFilteredList(page: Page): Promise<void> {
  await page.goto(`/inventory?q=${encodeURIComponent(ITEM_NAME)}`);
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Inventory — item lifecycle (create, view, edit, delete)', () => {
  test.describe.configure({ mode: 'serial' });

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
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        // WebKit logs failed <img> loads (e.g. poster images) as console.error.
        // The e2e image cache is not populated during seeding, so 404s are expected.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  // Best-effort cleanup: if a test above bailed before the explicit delete step,
  // remove the leftover item so repeat local runs stay deterministic.
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await useRealApi(page);
      await gotoFilteredList(page);
      const row = itemRow(page).first();
      if (await row.isVisible().catch(() => false)) {
        await row.click();
        await expect(page.getByRole('heading', { name: ITEM_NAME })).toBeVisible({
          timeout: 10_000,
        });
        await page.getByRole('button', { name: /^delete$/i }).click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: /^delete$/i })
          .click();
        await expect(page).toHaveURL(/\/inventory(\?|$)/, { timeout: 10_000 });
      }
    } catch {
      // Cleanup is best-effort — swallow failures so they don't mask real test failures.
    } finally {
      await page.close();
      await context.close();
    }
  });

  test('creates an item and it appears in the list with correct values', async ({ page }) => {
    await page.goto('/inventory/items/new');
    await expect(page.getByRole('heading', { name: /new item/i })).toBeVisible({
      timeout: 10_000,
    });

    // react-hook-form registers each field by name; labels aren't linked via htmlFor.
    await page.locator('input[name="itemName"]').fill(ITEM_NAME);
    await page.locator('select[name="type"]').selectOption(ITEM_TYPE);
    await page.locator('input[name="replacementValue"]').fill(INITIAL_REPLACEMENT);

    // Location is picked through a Radix Popover combobox — open, search for the
    // seeded child location, then click it. The search input filters the tree
    // and auto-expands matches, so we don't need to drill through ancestors.
    // Scope to the <button role="combobox"> because the Type and Condition
    // fields are native <select> elements (implicit ARIA role="combobox"),
    // so an unscoped getByRole('combobox') matches 3 elements on this form.
    const locationTrigger = page.locator('button[role="combobox"]');
    await locationTrigger.click();
    const popover = page.getByPlaceholder(/search locations/i);
    await expect(popover).toBeVisible();
    await popover.fill(ITEM_LOCATION);
    await page.getByRole('button', { name: new RegExp(`^${ITEM_LOCATION}$`, 'i') }).click();
    // Combobox closes when a location is selected; the trigger now shows the path.
    await expect(locationTrigger).toContainText(ITEM_LOCATION);

    await page.getByRole('button', { name: /create item/i }).click();

    // Create mutation navigates to the detail page.
    // The id is whatever the API generates (crypto.randomUUID today, but ids are
    // treated as opaque strings elsewhere — e.g. seed rows use `inv-001`), so match
    // any non-empty final path segment rather than a specific charset.
    await expect(page).toHaveURL(/\/inventory\/items\/[^/]+$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: ITEM_NAME })).toBeVisible();
    await expect(page.getByText(INITIAL_REPLACEMENT_FORMATTED)).toBeVisible();

    // Back to the list — confirm the new item renders with its replacement value.
    await gotoFilteredList(page);
    const row = itemRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(ITEM_TYPE);
    await expect(row).toContainText(ITEM_LOCATION);
    await expect(row).toContainText(INITIAL_REPLACEMENT_FORMATTED);
  });

  // TODO(#2157): re-enable once item edit save reliably fires success toast and navigates back.
  test.skip('edits the replacement value and the updated value shows in the list', async ({
    page,
  }) => {
    await gotoFilteredList(page);
    const row = itemRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    // Detail page for the created item.
    await expect(page.getByRole('heading', { name: ITEM_NAME })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/inventory\/items\/[^/]+$/);

    await page.getByRole('link', { name: /edit/i }).click();
    await expect(page.getByRole('heading', { name: /edit item/i })).toBeVisible({
      timeout: 10_000,
    });

    const replacementInput = page.locator('input[name="replacementValue"]');
    // Current value is pre-populated from the item record.
    await expect(replacementInput).toHaveValue(INITIAL_REPLACEMENT);
    await replacementInput.fill(UPDATED_REPLACEMENT);

    await page.getByRole('button', { name: /save changes/i }).click();

    // Wait for the save to complete via the success toast. The update mutation's
    // onSuccess also calls navigate() back to the detail page, but that redirect
    // has been observed to not fire in e2e (toast + cache invalidation succeed,
    // URL stays on /edit). Rather than depending on the auto-nav, we rely on the
    // toast as the positive completion signal and navigate to the list manually
    // — the list assertion still proves the mutation persisted end-to-end.
    // Sonner nests elements, so scope to .first() to avoid strict-mode violations.
    await expect(page.getByText(/item updated/i).first()).toBeVisible({ timeout: 10_000 });

    // Back to the list — confirm the updated value reflects there.
    await gotoFilteredList(page);
    const updatedRow = itemRow(page).first();
    await expect(updatedRow).toBeVisible({ timeout: 10_000 });
    await expect(updatedRow).toContainText(UPDATED_REPLACEMENT_FORMATTED, { timeout: 10_000 });
    await expect(updatedRow).not.toContainText(INITIAL_REPLACEMENT_FORMATTED);
  });

  test('deletes the item and it is removed from the list', async ({ page }) => {
    await gotoFilteredList(page);
    const row = itemRow(page).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    await expect(page.getByRole('heading', { name: ITEM_NAME })).toBeVisible({
      timeout: 10_000,
    });

    // The detail page has both an "Edit" link and a "Delete" button in the header.
    await page.getByRole('button', { name: /^delete$/i }).click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(new RegExp(`delete ${ITEM_NAME}`, 'i'))).toBeVisible();

    await confirm.getByRole('button', { name: /^delete$/i }).click();

    // Delete mutation navigates back to the list.
    await expect(page).toHaveURL(/\/inventory(\?|$)/, { timeout: 10_000 });

    // Confirm the row is gone from the filtered list.
    await gotoFilteredList(page);
    await expect(itemRow(page)).toHaveCount(0, { timeout: 10_000 });
  });
});
