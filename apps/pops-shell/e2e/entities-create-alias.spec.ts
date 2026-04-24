/**
 * E2E test — Finance entities create + add alias (#2109)
 *
 * Tier 2 coverage: navigate to /finance/entities, create a new entity (name,
 * type), reopen it via the row Actions → Edit menu (the app has no separate
 * `/finance/entities/:id` detail route — the EntityFormDialog is the canonical
 * detail/edit surface), add an alias chip, save, then reload the page and
 * confirm the alias persists against the real seeded SQLite `e2e` env.
 *
 * Idempotency: the entity name embeds Date.now() so repeated runs within the
 * same `e2e` environment never collide on the unique-name constraint enforced
 * by the entities router (ConflictError on duplicate). The `e2e` env itself is
 * recreated by globalSetup/globalTeardown so long-term cleanup is handled
 * there — within a single Playwright session we only need uniqueness.
 *
 * Locator strategy:
 *   - TextInput and Select in @pops/ui render a `<label>` sibling without a
 *     matching `htmlFor`, so `getByLabel` does not resolve to the input.
 *     Inputs are reached via their distinctive placeholder text instead.
 *   - The Aliases ChipInput shares its placeholder with the Default Tags
 *     ChipInput, so it is scoped through the Aliases field wrapper
 *     (the `<label>` parent) before looking up the inner `<input>`.
 *
 * Crash detection: pageerror and real console errors are asserted empty in
 * afterEach so every step in the flow also guards against JS crashes.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

/**
 * Scope to the `space-y-2` wrapper that pairs a given `<label>` with its
 * ChipInput. TextInput/Select labels are rendered without `htmlFor`, so the
 * usual `getByLabel` path does not resolve the input — we match the `<label>`
 * element by text, then step up to its direct parent wrapper.
 */
function fieldByLabel(root: Locator, labelText: string): Locator {
  return root.locator('label', { hasText: new RegExp(`^${labelText}$`) }).locator('..');
}

/**
 * The EntityFormDialog portals outside the page root — scope by the
 * Radix `dialog` role for robust selection across both create and edit modes.
 */
function entityDialog(page: Page) {
  return page.getByRole('dialog');
}

test.describe('Finance — entities create + add alias', () => {
  test.describe.configure({ mode: 'serial' });

  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  // Unique per run so the unique-name constraint never collides.
  const entityName = `E2E Entity ${Date.now()}`;
  const aliasValue = `e2e-alias-${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    await useRealApi(page);
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/finance/entities');
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible({
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

  test('creates an entity, adds an alias, and persists across reload', async ({ page }) => {
    // --- Step 1: open the create dialog -----------------------------------
    await page.getByRole('button', { name: /add entity/i }).click();
    const dialog = entityDialog(page);
    await expect(dialog.getByText('New Entity')).toBeVisible();

    // --- Step 2: fill name + type and submit ------------------------------
    // No htmlFor on the TextInput label, so match by the distinctive name
    // field placeholder instead.
    await dialog.getByPlaceholder('e.g. Woolworths, Netflix').fill(entityName);
    // The Type <select> is the only one that exposes a 'company' option.
    await dialog
      .locator('select')
      .filter({ has: page.locator('option[value="company"]') })
      .selectOption('company');

    await dialog.getByRole('button', { name: 'Create' }).click();

    // Dialog closes on success and the row appears in the table.
    await expect(dialog).toBeHidden();
    const newRow = page.getByRole('row').filter({ hasText: entityName });
    await expect(newRow).toBeVisible({ timeout: 10_000 });

    // --- Step 3: reopen via Actions → Edit --------------------------------
    await newRow.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: /edit/i }).click();

    const editDialog = entityDialog(page);
    await expect(editDialog.getByText('Edit Entity')).toBeVisible();

    // --- Step 4: add an alias chip ----------------------------------------
    const aliasWrapper = fieldByLabel(editDialog, 'Aliases');
    const aliasInput = aliasWrapper.locator('input[type="text"]');
    await aliasInput.fill(aliasValue);
    await aliasInput.press('Enter');

    // The chip renders immediately as a rendered value inside the wrapper.
    await expect(aliasWrapper.getByText(aliasValue, { exact: true })).toBeVisible();

    // --- Step 5: save updates and close dialog ----------------------------
    await editDialog.getByRole('button', { name: 'Update' }).click();
    await expect(editDialog).toBeHidden();

    // Row reflects the alias badge after the update.
    await expect(
      page.getByRole('row').filter({ hasText: entityName }).getByText(aliasValue, { exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // --- Step 6: reload and assert persistence ----------------------------
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible({
      timeout: 10_000,
    });

    const reloadedRow = page.getByRole('row').filter({ hasText: entityName });
    await expect(reloadedRow).toBeVisible({ timeout: 10_000 });
    await expect(reloadedRow.getByText(aliasValue, { exact: true })).toBeVisible();
  });
});
