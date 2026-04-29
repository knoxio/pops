/**
 * Integration test — Inventory insurance report filtered by location (#2114)
 *
 * Tier 2: navigate to /inventory/reports/insurance, pick a seeded location filter,
 * verify only items from that location are shown, the displayed total matches the
 * sum of those items' replacement values, and no console errors occur.
 *
 * Real API against the seeded 'e2e' SQLite environment.
 *
 * Seeded location used: "Shelf 2" (id `loc-cage-shelf2`) under Storage Cage.
 * Items at that leaf:
 *   - inv-015 Road Bike          replacementValue: $3,299
 *   - inv-016 Bike Helmet        replacementValue:   $249
 * Expected total: $3,548 (rendered as "$3,548" via formatAUD in en-AU locale).
 *
 * Chosen because it is a leaf location (no sub-location spill) with ≥2 items and
 * a predictable sum. Filtering by locationId is exercised through two paths:
 *   1. Direct query string (?locationId=loc-cage-shelf2) — verifies the URL
 *      driver wiring that NodeActions uses when deep-linking from the tree page.
 *   2. Interactive filter — opens the LocationPicker popover, searches for
 *      "Shelf 2", clicks the matching tree node, and re-verifies scope + total.
 */
import { expect, type Page, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const LOCATION_NAME = 'Shelf 2';
const LOCATION_ID = 'loc-cage-shelf2';
const EXPECTED_ITEMS = ['Road Bike', 'Bike Helmet'] as const;
/** Items that live elsewhere — must NOT appear in the filtered groups section. */
const OTHER_ITEMS = [
  'MacBook Pro 16-inch',
  'Sony WH-1000XM5 Headphones',
  'Samsung 65" QLED TV',
  'Dyson V15 Vacuum',
  'Breville Barista Express',
] as const;
/** formatAUD renders en-AU AUD with 0 fraction digits: "$3,548". */
const EXPECTED_TOTAL = '$3,548';

/**
 * Scope visible-only queries to the print-hidden ReportSummary / GroupTable blocks.
 * The table body rows include every item name the user sees as a data row.
 */
function summaryTotal(page: Page) {
  // "Total Replacement Value" heading sibling holds the formatted amount.
  return page
    .getByText(/Total Replacement Value/i)
    .locator('..')
    .getByText(/\$/);
}

function visibleItemRow(page: Page, name: string) {
  // Table rows live inside <tbody>; match the cell containing the item name.
  return page.locator('tbody tr', { hasText: name }).filter({ visible: true });
}

async function expectScopedToLocation(page: Page): Promise<void> {
  // All expected items present.
  for (const name of EXPECTED_ITEMS) {
    await expect(visibleItemRow(page, name).first()).toBeVisible({ timeout: 10_000 });
  }
  // No items from other locations rendered.
  for (const name of OTHER_ITEMS) {
    await expect(visibleItemRow(page, name)).toHaveCount(0);
  }
  // Total matches the sum of the expected items' replacement values.
  await expect(summaryTotal(page)).toHaveText(EXPECTED_TOTAL);
}

test.describe('Inventory — insurance report filtered by location', () => {
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
    // Filter out noise that is unrelated to insurance report logic.
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('deep-link with ?locationId scopes items and total to that location', async ({ page }) => {
    await page.goto(`/inventory/reports/insurance?locationId=${LOCATION_ID}`);

    // Summary renders before we assert totals.
    await expect(page.getByRole('heading', { name: /Insurance Report/i })).toBeVisible({
      timeout: 10_000,
    });
    await expectScopedToLocation(page);
  });

  test('selecting a location via the picker scopes items and total', async ({ page }) => {
    await page.goto('/inventory/reports/insurance');

    // Sanity: unfiltered report is visible first — Road Bike must be present
    // somewhere in the all-locations view so we know the page rendered fully.
    await expect(page.getByRole('heading', { name: /Insurance Report/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(visibleItemRow(page, 'Road Bike').first()).toBeVisible();
    await expect(visibleItemRow(page, 'MacBook Pro 16-inch').first()).toBeVisible();

    // Open the LocationPicker popover. The trigger is a combobox button that
    // contains the "All locations" placeholder when nothing is selected.
    await page.getByRole('combobox', { name: /All locations/i }).click();

    // Search narrows the tree and auto-expands ancestors. filterTree uses
    // case-insensitive substring, so "Shelf 2" uniquely matches loc-cage-shelf2.
    await page.getByPlaceholder(/search locations/i).fill(LOCATION_NAME);

    // Click the matching tree node (leaf button with the location name).
    await page.getByRole('button', { name: LOCATION_NAME, exact: true }).click();

    // Picker closes; report re-queries with locationId in the URL.
    await expect(page).toHaveURL(/locationId=loc-cage-shelf2/);
    await expectScopedToLocation(page);
  });
});
