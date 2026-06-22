/**
 * E2E tests — AI rules: create + preview, edit + verify updated preview.
 *
 * Closes:
 *   - #2119  Tier 2 — create a new rule and confirm preview matches against
 *            seeded transactions.
 *   - #2135  Tier 3 — edit an existing rule's pattern and confirm the
 *            updated preview reflects the new match set, then save and
 *            assert persistence across reload.
 *
 * Both flows run against the real `/ai/rules` page, hitting the seeded `e2e`
 * SQLite environment via the standard `useRealApi` helper. The seeded data
 * (see `apps/pops-api/src/db/seeder.ts`) provides:
 *   - 16 transactions including `Woolworths Metro`, `Woolworths`,
 *     `Netflix Subscription`, `Shell Service Station`, `Coles Local`
 *   - 2 corrections: `WOOLWORTHS%` (contains, Groceries) and
 *     `NETFLIX` (exact, Entertainment/Subscriptions)
 *
 * Locator strategy mirrors `entities-create-alias.spec.ts`:
 *   - The dialog is portaled, so we always scope through `getByRole('dialog')`.
 *   - TextInput and Select labels in @pops/ui render without `htmlFor`, so
 *     we reach inputs by placeholder / accessible name where possible.
 *   - Each test seeds a unique pattern derived from `Date.now()` to keep
 *     repeated runs against the same long-lived `e2e` env from colliding
 *     with the unique-pattern constraint enforced by `createOrUpdate`.
 *
 * Crash detection: pageerror and real console errors are asserted empty in
 * afterEach so every step in the flow also guards against JS crashes.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

function rulesDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

function previewMatchRows(dialog: Locator): Locator {
  return dialog.locator('[data-testid="preview-match-row"]');
}

async function fillPattern(dialog: Locator, pattern: string): Promise<void> {
  const input = dialog.getByPlaceholder('e.g. WOOLWORTHS');
  await input.fill('');
  await input.fill(pattern);
}

async function selectMatchType(
  dialog: Locator,
  value: 'exact' | 'contains' | 'regex'
): Promise<void> {
  // The Match Type Select is the only one in the dialog with a `contains` option.
  await dialog
    .locator('select')
    .filter({ has: dialog.page().locator('option[value="contains"]') })
    .selectOption(value);
}

async function clickRunPreview(dialog: Locator): Promise<void> {
  await dialog.locator('[data-testid="rule-preview-run"]').click();
}

/**
 * normalizeDescription (server-side) strips digits, so unique suffixes for
 * idempotent runs need to use only [A-Z]. This converts a number to a
 * letter-only string by base-26 encoding (one letter per digit-pair).
 */
function uniqueAlphaSuffix(): string {
  let n = Date.now();
  let out = '';
  while (n > 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

async function expectPreviewIncludes(dialog: Locator, description: string): Promise<void> {
  // Multiple seeded transactions can match a single description fragment
  // (e.g. "Woolworths Metro" + "Woolworths" + "Woolworths Petrol"), so scope
  // the visibility check to the first match — the preview just needs to
  // surface at least one row containing the description.
  await expect(previewMatchRows(dialog).filter({ hasText: description }).first()).toBeVisible({
    timeout: 10_000,
  });
}

async function expectPreviewExcludes(dialog: Locator, description: string): Promise<void> {
  // Wait until the preview list has rendered before asserting absence so the
  // assertion can't pass on the still-empty initial state.
  await expect(previewMatchRows(dialog).first()).toBeVisible({ timeout: 10_000 });
  await expect(previewMatchRows(dialog).filter({ hasText: description })).toHaveCount(0);
}

test.describe('AI rules — manual create/edit + preview', () => {
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
    await page.goto('/cerebrum/admin/rules');
    await expect(page.getByRole('heading', { name: 'Categorisation Rules' })).toBeVisible({
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

  test('#2119 — creates a rule and confirms preview matches seeded transactions', async ({
    page,
  }) => {
    // Use a regex matchType so the unique (pattern,matchType) tuple won't
    // collide with the seeded `WOOLWORTHS%`/contains correction even after
    // pattern normalisation — letting the test run idempotently against the
    // long-lived seeded env. The suffix uses A-Z only because the server
    // pattern normaliser strips digits before persisting.
    const uniqueSuffix = uniqueAlphaSuffix();
    const pattern = `WOOLWORTHS${uniqueSuffix}|WOOLWORTHS`;

    // --- Step 1: open create dialog ------------------------------------
    await page.getByRole('button', { name: /add rule/i }).click();
    const dialog = rulesDialog(page);
    await expect(dialog.getByText('New Rule')).toBeVisible();

    // --- Step 2: fill the form ----------------------------------------
    await fillPattern(dialog, pattern);
    await selectMatchType(dialog, 'regex');

    // --- Step 3: trigger preview ---------------------------------------
    await clickRunPreview(dialog);

    // --- Step 4: confirm preview shows seeded matches ------------------
    await expectPreviewIncludes(dialog, 'Woolworths');
    // …and excludes a transaction that should NOT match (Netflix).
    await expectPreviewExcludes(dialog, 'Netflix Subscription');

    // --- Step 5: save the rule -----------------------------------------
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();

    // The new rule appears in the table after the list invalidates. Match
    // by the unique alpha suffix because the stored pattern is the
    // normalised form of the input (uppercase, digits stripped).
    await expect(page.getByRole('row').filter({ hasText: uniqueSuffix })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('#2135 — edits an existing rule and verifies the updated preview, then persists', async ({
    page,
  }) => {
    // Create a rule we can then edit. Two reasons:
    //   1. The seeded WOOLWORTHS rule may collide with concurrent specs.
    //   2. The flow asserts persistence — we want to own the data lifecycle
    //      end-to-end so the cleanup story is just "delete this row" if the
    //      test author wants to wire it later.
    // A-Z only: server normaliser strips digits, so timestamp suffixes are
    // expressed via uniqueAlphaSuffix to keep the unique constraint honest.
    const original = `EEEDIT${uniqueAlphaSuffix()}`;
    const refined = `${original}NETFLIX`;

    // --- Step 1: create a contains rule that matches a broad set --------
    await page.getByRole('button', { name: /add rule/i }).click();
    const createDialog = rulesDialog(page);
    await fillPattern(createDialog, original);
    await selectMatchType(createDialog, 'contains');
    await createDialog.getByRole('button', { name: 'Create' }).click();
    await expect(createDialog).toBeHidden();

    // --- Step 2: open the row's edit action ----------------------------
    const newRow = page.getByRole('row').filter({ hasText: original });
    await expect(newRow).toBeVisible({ timeout: 10_000 });
    await newRow.getByRole('button', { name: new RegExp(`Edit rule ${original}`, 'i') }).click();

    const editDialog = rulesDialog(page);
    await expect(editDialog.getByText('Edit Rule')).toBeVisible();

    // --- Step 3: change the pattern to a narrower match ----------------
    // First broaden to NETFLIX to verify we hit Netflix Subscription.
    await fillPattern(editDialog, 'NETFLIX');
    await selectMatchType(editDialog, 'contains');
    await clickRunPreview(editDialog);
    await expectPreviewIncludes(editDialog, 'Netflix Subscription');

    // Then narrow to a pattern that should NOT match anything seeded.
    await fillPattern(editDialog, refined);
    await clickRunPreview(editDialog);
    await expect(editDialog.locator('[data-testid="preview-no-matches"]')).toBeVisible({
      timeout: 10_000,
    });

    // --- Step 4: save the edit -----------------------------------------
    await editDialog.getByRole('button', { name: 'Update' }).click();
    await expect(editDialog).toBeHidden();

    // --- Step 5: reload and confirm the new pattern persists ----------
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Categorisation Rules' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('row').filter({ hasText: refined })).toBeVisible({
      timeout: 10_000,
    });
  });
});
