/**
 * Integration test — Inventory locations: tree CRUD + item assignment (#2112)
 *
 * Tier 2 flow:
 *   1. Navigate to /inventory/locations
 *   2. Create a parent root location (e.g. e2e-parent-<ts>)
 *   3. Create a child under that parent (e.g. e2e-child-<ts>)
 *   4. Assign a seeded item (MacBook Pro, inv-001) to the child via the item
 *      edit form's LocationPicker
 *   5. Back on the locations page, expand the parent and confirm the child
 *      renders under it
 *   6. Select the child and confirm the assigned item appears in the contents
 *      panel
 *
 * Idempotency design:
 *   - Unique timestamp-suffixed names for parent/child — re-running the test
 *     on a persisted e2e env creates fresh nodes and never collides.
 *   - Cleanup runs in reverse order inside a finally block: re-assign the
 *     seeded item back to its original location (loc-desk), then delete the
 *     child (empty → direct delete), then the parent (empty → direct delete).
 *     If cleanup is skipped (e.g. crash mid-test), the next run uses new
 *     unique names and the API allows multiple locations with the same name.
 *   - No UI assertions on seed counts — only on the names we created.
 *
 * Real API routed through useRealApi against the seeded 'e2e' SQLite env.
 *
 * Tests run serially because they share a single parent/child the earlier
 * test creates — the second test verifies the item assignment persists.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const SEEDED_ITEM_ID = 'inv-001';
const SEEDED_ITEM_NAME = 'MacBook Pro 16-inch';
const SEEDED_ITEM_ORIGINAL_LOCATION = 'Desk';

/**
 * Scoped locator for the LocationPicker trigger. The item form also contains
 * native `<select>` elements (Type, Condition) which Playwright exposes as
 * `combobox`; Radix's button trigger is the only `<button>` with that role.
 */
function locationPickerTrigger(page: Page): Locator {
  return page.locator('button[role="combobox"]');
}

/**
 * Tree rows render with role="treeitem" and have the node name inside. Filter
 * by exact text to avoid matching substrings (e.g. a parent name that happens
 * to be a prefix of the child name).
 */
function treeItem(page: Page, name: string): Locator {
  return page
    .getByRole('treeitem')
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
}

async function createRootLocation(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /add root location/i }).click();
  const input = page.getByPlaceholder('Root location name');
  await expect(input).toBeVisible();
  await input.fill(name);
  await input.press('Enter');
  await expect(treeItem(page, name)).toBeVisible({ timeout: 10_000 });
}

async function createChildLocation(
  page: Page,
  parentName: string,
  childName: string
): Promise<void> {
  const parent = treeItem(page, parentName);
  // Hover the row so the opacity-0 action cluster becomes visible on WebKit.
  await parent.hover();
  // The FolderPlus button has aria-label="Add child to <parentName>"; force the
  // click because the button lives inside a group-hover opacity wrapper.
  await page.getByRole('button', { name: `Add child to ${parentName}` }).click({ force: true });

  // Exact match — both the root input ("Root location name") and the child
  // input ("Location name") live under the tree container after root save.
  const input = page.getByPlaceholder('Location name', { exact: true });
  await expect(input).toBeVisible();
  await input.fill(childName);
  await input.press('Enter');
  await expect(treeItem(page, childName)).toBeVisible({ timeout: 10_000 });
}

/**
 * Open the item edit page, pick the target location via LocationPicker, save.
 * Uses the search field to filter to the freshly-created location.
 *
 * Treat the success toast as the positive completion signal rather than the
 * post-save redirect; tree-side assertions in the sibling test prove the
 * write persisted.
 */
async function assignItemToLocation(
  page: Page,
  itemId: string,
  locationName: string
): Promise<void> {
  await page.goto(`/inventory/items/${itemId}/edit`);
  // Edit form header confirms we landed on the right page.
  await expect(page.getByRole('heading', { name: /edit item/i })).toBeVisible({
    timeout: 10_000,
  });

  await locationPickerTrigger(page).click();

  // Search narrows the tree; the unique timestamp name guarantees a single
  // tree button matches. Filter with hasText to sidestep nested-button
  // accessible-name weirdness (the row button contains an expand-toggle
  // role="button" child).
  const search = page.getByPlaceholder(/search locations/i);
  await expect(search).toBeVisible();
  await search.fill(locationName);
  await page
    .getByRole('button')
    .filter({ hasText: new RegExp(`^${locationName}$`) })
    .click();

  // Trigger should now display the selected location name.
  await expect(locationPickerTrigger(page)).toContainText(locationName);

  await page.getByRole('button', { name: /save changes/i }).click();

  // Sonner nests elements inside the toast, so scope to .first() to avoid
  // strict-mode violations when multiple text nodes match.
  await expect(page.getByText(/item updated/i).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Click the expand chevron on a collapsed tree row. Roots default to open,
 * but after a tree-refresh (navigation) deeper roots may be open while leaves
 * are closed. If already expanded this is a no-op (aria-expanded="true").
 */
async function ensureExpanded(page: Page, name: string): Promise<void> {
  const row = treeItem(page, name);
  const expanded = await row.getAttribute('aria-expanded');
  if (expanded === 'false') {
    await row.getByRole('button', { name: /expand/i }).click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
  }
}

/**
 * Delete a location that we know has no children/items. The API short-circuits
 * directly to success without opening the confirmation dialog when the stats
 * are empty.
 */
async function deleteEmptyLocation(page: Page, name: string): Promise<void> {
  const row = treeItem(page, name);
  await row.hover();
  await page.getByRole('button', { name: `Delete ${name}` }).click({ force: true });
  await expect(treeItem(page, name)).toHaveCount(0, { timeout: 10_000 });
}

/*
 * End-to-end coverage for the locations tree: parent/child CRUD plus the
 * assignment of a seeded item to the new child via the item edit form's
 * LocationPicker. The serial pair verifies that the assignment persists in
 * the tree contents panel after navigation.
 */
test.describe('Inventory — locations tree CRUD and item assignment', () => {
  test.describe.configure({ mode: 'serial' });

  // Shared across the serial tests in this describe block.
  const runTs = Date.now();
  const parentName = `e2e-parent-${runTs}`;
  const childName = `e2e-child-${runTs}`;

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

  test('creates parent → child and assigns a seeded item to the child', async ({ page }) => {
    await page.goto('/inventory/locations');
    await expect(page.getByRole('heading', { name: /locations/i })).toBeVisible();

    await createRootLocation(page, parentName);
    await createChildLocation(page, parentName, childName);

    // Assigning the item to the new child persists the link that the next
    // test verifies from the tree UI.
    await assignItemToLocation(page, SEEDED_ITEM_ID, childName);
  });

  test('expanded tree shows hierarchy and the assigned item appears under the child', async ({
    page,
  }) => {
    await page.goto('/inventory/locations');
    await expect(page.getByRole('heading', { name: /locations/i })).toBeVisible();

    // Parent exists and is expandable.
    const parent = treeItem(page, parentName);
    await expect(parent).toBeVisible();
    await ensureExpanded(page, parentName);

    // Child is nested under the parent — verify it renders once the parent
    // is expanded.
    const child = treeItem(page, childName);
    await expect(child).toBeVisible();

    // Selecting the child opens the contents panel showing its direct items.
    await child.click();
    await expect(page.getByRole('button', { name: new RegExp(SEEDED_ITEM_NAME, 'i') })).toBeVisible(
      { timeout: 10_000 }
    );
  });

  test.afterAll(async ({ browser }) => {
    // Restore the world: reassign the item back to its seed location, then
    // remove both locations. Running this in a fresh page keeps it isolated
    // from the per-test error tracking, and the SQLite e2e env persists
    // between runs so leaking state would distort later tests.
    const page = await browser.newPage();
    try {
      await useRealApi(page);

      // 1. Reassign the seeded item back to its original seeded location.
      //    Assert on the success toast rather than the post-save URL redirect.
      await page.goto(`/inventory/items/${SEEDED_ITEM_ID}/edit`);
      await expect(page.getByRole('heading', { name: /edit item/i })).toBeVisible({
        timeout: 10_000,
      });
      await locationPickerTrigger(page).click();
      const search = page.getByPlaceholder(/search locations/i);
      await search.fill(SEEDED_ITEM_ORIGINAL_LOCATION);
      await page
        .getByRole('button')
        .filter({ hasText: new RegExp(`^${SEEDED_ITEM_ORIGINAL_LOCATION}$`) })
        .first()
        .click();
      await page.getByRole('button', { name: /save changes/i }).click();
      await expect(page.getByText(/item updated/i).first()).toBeVisible({ timeout: 10_000 });

      // 2. Delete the now-empty child, then the empty parent.
      await page.goto('/inventory/locations');
      await expect(page.getByRole('heading', { name: /locations/i })).toBeVisible();
      await ensureExpanded(page, parentName);
      await deleteEmptyLocation(page, childName);
      await deleteEmptyLocation(page, parentName);
    } finally {
      await page.close();
    }
  });
});
