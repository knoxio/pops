/**
 * E2E — Inventory reports: value breakdown by location (#2128)
 *
 * Tier 3: navigate to `/inventory/reports`, confirm the Value by Location
 * widget renders, at least one seeded location shows a non-zero replacement
 * value, and the sum across all locations equals the overall replacement
 * value shown in the items list summary.
 *
 * Why cross-check via tRPC rather than the DOM:
 *   The Value by Location card renders a recharts bar chart. The YAxis
 *   exposes location names as SVG <text> labels (semantically readable),
 *   but the numeric totals are only surfaced through the hover tooltip —
 *   there is no accessible name, data-* attribute, or inline text node
 *   carrying the per-location dollar figure. Hovering each SVG bar to
 *   scrape tooltip text is brittle on WebKit (hover-gated UI loses
 *   pointer events) and tightly couples the test to chart geometry.
 *
 *   Instead, we fetch the two tRPC procedures directly through Playwright's
 *   request context (which routes through the Vite proxy to the seeded
 *   e2e API) and assert the invariant on the authoritative server data.
 *   The DOM assertions confirm the widget is actually mounted and rendering
 *   the same seeded locations; the number-level cross-check runs against
 *   the source of truth.
 *
 * Semantic-locator gap (flagged for product follow-up):
 *   ValueBreakdown's BreakdownChart should expose each entry's total as an
 *   accessible label on the bar element (e.g. aria-label="Desk: $5,628, 4
 *   items") so tests — and screen-reader users — can read the values
 *   without hovering. Recharts does not render the totals anywhere in the
 *   static DOM today.
 *
 * Seeded value snapshot (from apps/pops-api/src/db/seeder.ts):
 *   All 20 inventory items carry a location_id, so `getValueByLocation`
 *   produces no "Unassigned" bucket and its SUM equals the unfiltered items
 *   list `totalReplacementValue`. With the current seed that total is
 *   $20,604 spread over 12 leaf locations, with Desk ($5,628) and Shelf 2
 *   ($3,548) as the largest buckets.
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies the page does not crash (no separate crash test needed).
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

/**
 * tRPC batch GET URL shape for an input-less query.
 * Mirrors the format used by apps/pops-api/src/middleware/env-context.integration.test.ts.
 */
const NO_INPUT_BATCH = encodeURIComponent(JSON.stringify({ '0': null }));

interface BreakdownEntry {
  name: string;
  totalValue: number;
  itemCount: number;
  key?: string | null;
}

interface ItemsListTotals {
  totalReplacementValue: number;
  totalResaleValue: number;
}

/**
 * Fetch the valueByLocation entries via the real API using the seeded e2e DB.
 * Bypasses `page.route` interception because `page.request` runs in Playwright's
 * own request context rather than through the browser's fetch pipeline.
 */
async function fetchValueByLocation(request: APIRequestContext): Promise<BreakdownEntry[]> {
  const res = await request.get(
    `/trpc/inventory.reports.valueByLocation?batch=1&input=${NO_INPUT_BATCH}&env=e2e`
  );
  expect(res.status(), 'valueByLocation responds 200').toBe(200);
  const body = (await res.json()) as Array<{ result: { data: { data: BreakdownEntry[] } } }>;
  const first = body[0];
  expect(first, 'batch response includes first procedure').toBeDefined();
  return first!.result.data.data;
}

/**
 * Fetch the unfiltered inventory items list totals (the same summary that
 * renders at the top of `/inventory`).
 */
async function fetchItemsListTotals(request: APIRequestContext): Promise<ItemsListTotals> {
  // Match the shell's default list call: no filters, just request page 1.
  const listInput = encodeURIComponent(JSON.stringify({ '0': {} }));
  const res = await request.get(`/trpc/inventory.items.list?batch=1&input=${listInput}&env=e2e`);
  expect(res.status(), 'inventory.items.list responds 200').toBe(200);
  const body = (await res.json()) as Array<{
    result: { data: { totals: ItemsListTotals } };
  }>;
  const first = body[0];
  expect(first, 'batch response includes first procedure').toBeDefined();
  return first!.result.data.totals;
}

test.describe('Inventory reports — value breakdown by location', () => {
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
    await page.goto('/inventory/reports');
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

  test('renders the Value by Location widget with seeded location labels', async ({ page }) => {
    // Card heading — responsive duplicates guarded via visibility filter.
    await expect(
      page.getByText('Value by Location', { exact: true }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });

    // YAxis category labels render as SVG <text> with the location name. Assert
    // a couple of seeded top-value locations surface so we know the chart
    // actually painted rather than just the loading skeleton.
    // "Desk" is the highest-value location ($5,628: MacBook + hub + cables +
    // power board); "Office" is next ($3,094: standing desk + Aeron chair).
    await expect(page.getByText('Desk', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Office', { exact: true }).first()).toBeVisible();
  });

  test('sum of per-location values equals overall items list replacement total', async ({
    page,
    request,
  }) => {
    // Wait until the card has resolved past its loading skeleton before the
    // numeric cross-check, so the widget-visible and data-shape assertions
    // share a consistent frame of reference.
    await expect(
      page.getByText('Value by Location', { exact: true }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });

    const [locationEntries, itemsTotals] = await Promise.all([
      fetchValueByLocation(request),
      fetchItemsListTotals(request),
    ]);

    // The seed produces 12 location buckets. Any non-empty result is a valid
    // baseline — guard against a silent regression that yields []` and still
    // "passes" because 0 === 0.
    expect(locationEntries.length, 'at least one location bucket is returned').toBeGreaterThan(0);

    // At least one location holds a positive replacement value (the issue's
    // "≥1 location with non-zero value" acceptance criterion).
    const positiveLocations = locationEntries.filter((e) => e.totalValue > 0);
    expect(
      positiveLocations.length,
      'at least one location has a non-zero replacement value'
    ).toBeGreaterThan(0);

    // Cross-check: sum(location values) === overall replacement total on the
    // items list. SQLite returns these sums as IEEE floats, so compare with a
    // small tolerance rather than strict equality.
    const sum = locationEntries.reduce((acc, entry) => acc + entry.totalValue, 0);
    expect(sum, 'location sum matches items list replacement total').toBeCloseTo(
      itemsTotals.totalReplacementValue,
      2
    );

    // Sanity: total must be a positive number (seeded DB is not empty).
    expect(itemsTotals.totalReplacementValue).toBeGreaterThan(0);
  });
});
