/**
 * Tier 2 — Transactions tag edit + save via real API (#2107)
 *
 * Flow
 * ----
 * 1. Navigate to /finance/transactions against the seeded e2e SQLite env.
 * 2. Open the TagEditor popover on the "Coles Local" seeded row (single
 *    Groceries tag, unique description).
 * 3. Add a unique-per-run tag via free-text entry (Enter key).
 * 4. Remove the existing Groceries tag via the Chip remove button.
 * 5. Save — popover closes and the row reflects the new tag set.
 * 6. Reload the page — verify persistence: new tag still there, Groceries gone.
 * 7. Clean up: reopen the editor, remove the unique tag, re-add Groceries,
 *    save. Restores the seeded row exactly.
 *
 * Idempotency
 * -----------
 * The unique tag name embeds Date.now(), so re-runs never collide even if a
 * previous run failed mid-flight. Teardown restores the seeded state so the
 * shared seeded e2e DB does not drift across runs of this or other suites.
 *
 * Interaction notes
 * -----------------
 * - TagEditor is a Radix Popover. We locate it by its stable DOM hook
 *   `[data-slot="popover-content"]` — ARIA role="dialog" is set by Radix but
 *   WebKit's accessibility tree does not always surface non-modal popovers
 *   under that role, so the DOM attribute is the portable choice.
 * - The trigger button has aria-label="Edit tags"; there is one per row, so
 *   we scope it inside the row locator for "Coles Local".
 * - The input inside the popover is a bare <input type="text"> identified by
 *   its placeholder. Enter commits a free-text tag.
 * - Each tag renders as a @pops/ui Chip: a <div> containing the tag text and
 *   a <button aria-label="Remove">. We scope the remove click by filtering
 *   Chip containers by their exact tag text, then target the Remove button.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const TARGET_DESCRIPTION = 'Coles Local';
const SEEDED_TAG = 'Groceries';
const UNIQUE_TAG = `e2e-tag-${Date.now()}`;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function targetRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: TARGET_DESCRIPTION }).first();
}

function popover(page: Page): Locator {
  return page.locator('[data-slot="popover-content"]');
}

async function openTagEditor(page: Page): Promise<Locator> {
  await targetRow(page).getByRole('button', { name: 'Edit tags' }).click();
  const content = popover(page);
  await expect(content).toBeVisible();
  return content;
}

async function addFreeTextTag(content: Locator, tag: string): Promise<void> {
  const input = content.getByPlaceholder('Type to add a tag…');
  await input.fill(tag);
  await input.press('Enter');
  // Newly-added tag appears as a removable Chip inside the popover.
  await expect(content.getByText(tag, { exact: true })).toBeVisible();
}

async function removeTag(content: Locator, tag: string): Promise<void> {
  // Locate the Chip <div> whose full text matches the tag, then click its
  // Remove button. Filtering by exact hasText avoids substring collisions
  // (e.g. two chips sharing a prefix) without relying on DOM shape.
  const chip = content
    .locator('div')
    .filter({ hasText: new RegExp(`^${escapeRegex(tag)}$`) })
    .first();
  await expect(chip).toBeVisible();
  await chip.getByRole('button', { name: 'Remove' }).click();
  await expect(content.getByText(tag, { exact: true })).toHaveCount(0);
}

async function save(page: Page, content: Locator): Promise<void> {
  await content.getByRole('button', { name: 'Save' }).click();
  await expect(popover(page)).toHaveCount(0);
}

test.describe('Finance — transactions tag edit (real API)', () => {
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
    await expect(targetRow(page)).toBeVisible({ timeout: 10_000 });
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

  test('adds a new tag, removes the existing tag, saves, and persists across reload', async ({
    page,
  }) => {
    // 1) Open editor and perform the edits.
    let editor = await openTagEditor(page);
    await addFreeTextTag(editor, UNIQUE_TAG);
    await removeTag(editor, SEEDED_TAG);
    await save(page, editor);

    // 2) Row reflects the new state immediately (after list invalidation).
    //    Row badges apply text-transform: uppercase, so match case-insensitively.
    const uniqueTagRe = new RegExp(`^${escapeRegex(UNIQUE_TAG)}$`, 'i');
    const seededTagRe = new RegExp(`^${escapeRegex(SEEDED_TAG)}$`, 'i');
    const row = targetRow(page);
    await expect(row.getByText(uniqueTagRe)).toBeVisible();
    await expect(row.getByText(seededTagRe)).toHaveCount(0);

    // 3) Reload and confirm persistence via the real API.
    await page.reload();
    await expect(targetRow(page)).toBeVisible({ timeout: 10_000 });
    const rowAfterReload = targetRow(page);
    await expect(rowAfterReload.getByText(uniqueTagRe)).toBeVisible();
    await expect(rowAfterReload.getByText(seededTagRe)).toHaveCount(0);

    // 4) Teardown: restore original seeded state so the shared e2e DB does
    //    not drift across runs (belt-and-braces with the unique tag name).
    editor = await openTagEditor(page);
    await addFreeTextTag(editor, SEEDED_TAG);
    await removeTag(editor, UNIQUE_TAG);
    await save(page, editor);

    await expect(targetRow(page).getByText(seededTagRe)).toBeVisible();
    await expect(targetRow(page).getByText(uniqueTagRe)).toHaveCount(0);
  });
});
