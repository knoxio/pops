/**
 * Tier 3 — Settings change, save, and persistence (#2136)
 *
 * Navigates to /settings, deep-links to the media.rotation section, changes
 * a non-critical capacity setting ("Target Free Space (GB)") via the auto-save
 * form, waits for the persisted setBulk response, navigates to /finance, and
 * returns to /settings#media.rotation to verify the value is still shown.
 *
 * Setting rationale — `rotation_target_free_gb` is a seeded integer capacity
 * value (default '100') that affects rotation planning only. It has no impact
 * on authentication, connectivity, or third-party API access. Seeded in the
 * e2e DB, so it reliably loads to "100" on first render.
 *
 * Idempotency — the test writes a distinct value (150), asserts persistence,
 * then writes the seeded default (100) back as its last step so subsequent
 * runs against the same seeded DB start from a known state.
 *
 * Real API against the seeded 'e2e' SQLite environment via useRealApi().
 * Crash detection (pageerror + console error) wired into beforeEach/afterEach.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const ROTATION_SECTION_ID = 'media.rotation';
const TARGET_FREE_GB_LABEL = 'Target Free Space (GB)';
const SEEDED_VALUE = '100';
const CHANGED_VALUE = '150';

/**
 * Locate a field's numeric input by its label text, scoped to a given section.
 *
 * The settings FieldWrapper renders:
 *   <div class="space-y-1.5">
 *     <div class="flex ..."><label>Target Free Space (GB)</label> ...</div>
 *     <div class="flex gap-2"><input type="number" /> ...</div>
 *     ...
 *   </div>
 *
 * The radix <Label> component renders a bare <label> without `htmlFor`, so
 * `getByLabel` can't associate it with the input. Instead, match the
 * `<div.space-y-1.5>` field wrapper that contains a descendant label with
 * the exact text, then descend to the numeric input.
 *
 * The inner locator passed to `filter({ has })` MUST be a locator that
 * resolves to a descendant of each candidate div — passing an absolute
 * locator rooted at the section silently matches zero elements because the
 * section is not a descendant of the field wrapper.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findNumericInputByLabel(section: Locator, labelText: string): Locator {
  const exactLabel = new RegExp(`^${escapeRegex(labelText)}$`);
  return section
    .locator('div.space-y-1\\.5')
    .filter({ has: section.page().locator('label').filter({ hasText: exactLabel }) })
    .locator('input[type="number"]');
}

/** Wait for a successful core.settings.setBulk tRPC response. */
async function waitForSetBulkResponse(page: Page): Promise<void> {
  await page.waitForResponse(
    (res) => res.url().includes('core.settings.setBulk') && res.status() === 200,
    { timeout: 10_000 }
  );
}

test.describe('Settings — change, save, and persistence', () => {
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

  test.fixme('deep-links to rotation, changes a setting, saves, and persists across navigation — needs update for new settings manifests', async ({
    page,
  }) => {
    // 1. Deep-link to the rotation section of the settings page.
    await page.goto(`/settings#${ROTATION_SECTION_ID}`);

    // Section element carries id="media.rotation". Dots are valid HTML ids but
    // require attribute-selector syntax to match reliably in Playwright/CSS.
    const rotationSection = page.locator(`[id="${ROTATION_SECTION_ID}"]`);
    await expect(rotationSection).toBeVisible({ timeout: 10_000 });
    await expect(rotationSection.getByRole('heading', { name: 'Rotation' })).toBeVisible();

    // 2. Wait for the setBulk query to populate the form with the seeded value.
    const targetFreeInput = findNumericInputByLabel(rotationSection, TARGET_FREE_GB_LABEL);
    await expect(targetFreeInput).toHaveValue(SEEDED_VALUE, { timeout: 10_000 });

    // 3. Change the value. Auto-save debounces at 500ms; waiting for the
    //    setBulk network response is the save signal.
    await targetFreeInput.fill(CHANGED_VALUE);
    await waitForSetBulkResponse(page);

    // Value still reflected in the input after save resolves.
    await expect(targetFreeInput).toHaveValue(CHANGED_VALUE);

    // 4. Navigate away to a fully unrelated area so the settings page unmounts.
    await page.getByRole('button', { name: 'Finance' }).click();
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('heading').first()).toBeVisible();

    // 5. Return to settings via the deep-link to the same section.
    await page.goto(`/settings#${ROTATION_SECTION_ID}`);

    const rotationSectionAfter = page.locator(`[id="${ROTATION_SECTION_ID}"]`);
    await expect(rotationSectionAfter).toBeVisible({ timeout: 10_000 });

    // 6. The persisted value is re-rendered from the DB on remount.
    const targetFreeInputAfter = findNumericInputByLabel(
      rotationSectionAfter,
      TARGET_FREE_GB_LABEL
    );
    await expect(targetFreeInputAfter).toHaveValue(CHANGED_VALUE, { timeout: 10_000 });

    // 7. Idempotency — reset the setting to its seeded default before the
    //    test exits so re-runs against the same seeded DB start from a known
    //    state. Wait for the setBulk response so the write is durable before
    //    the test ends.
    await targetFreeInputAfter.fill(SEEDED_VALUE);
    await waitForSetBulkResponse(page);
    await expect(targetFreeInputAfter).toHaveValue(SEEDED_VALUE);
  });
});
