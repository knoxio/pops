/**
 * E2E — AI cache: view stats and clear stale entries (#2134)
 *
 * Tier 3 flow covering /cerebrum/admin/cache:
 *   1. Navigate to the Cache Management page.
 *   2. Confirm the three stat cards mount (Total Entries, Disk Size, Hit Rate).
 *   3. Note the "before" Total Entries value.
 *   4. Click "Clear Stale" (default 30-day max-age).
 *   5. Confirm the clear succeeded (success toast surfaces the removed count).
 *   6. Confirm the Total Entries card updates to a value <= the "before" value.
 *   7. Confirm no page errors or console errors fired.
 *
 * Real vs mock decision — MOCKED for the cache endpoints.
 *
 *   The AI entity cache is NOT isolated by the `e2e` named-env system: it's
 *   a process-level singleton backed by a JSON file on disk (see
 *   ai-categorizer-cache.ts). Running the prune against the real pillar would
 *   mutate shared state used by other tests (and the dev environment), so we
 *   mock the three core-api cache REST routes the page calls.
 *
 *   The page reads its data via the generated core Hey API client
 *   (`@pops/app-ai` core-api, baseUrl `/core-api`):
 *     - GET  /core-api/ai-usage/cache        → { totalEntries, diskSizeBytes }
 *     - GET  /core-api/ai-usage/stats        → usage roll-up
 *     - POST /core-api/ai-usage/cache/prune  → { removed }   (Clear Stale)
 *
 *   The mock drives a deterministic before/after comparison: the cache GET is
 *   routed through a mutable state object so the FIRST response returns a high
 *   entry count (1500), and after the prune fires the state flips so subsequent
 *   responses return a lower count (300). The cache model invalidates the
 *   `['core', 'aiUsage']` query key on mutation success, which triggers the
 *   re-fetch and re-renders the StatCard with the new total.
 *
 * Product feedback — StatCard value semantics.
 *
 *   StatCard renders `<h3>{title}</h3><p>{value}</p>`. The <p> has no
 *   accessible role, label, or data-testid, so scoping a Playwright locator
 *   to "the value for stat card X" has no clean semantic hook. The prior
 *   AI usage stats test used an XPath `following-sibling::p[1]` workaround,
 *   which was flagged in review. This test deliberately avoids XPath
 *   siblings: because the mock controls before/after values exactly, we
 *   assert the rendered number via `getByText(<value>, { exact: true })`
 *   at the page scope — the values (1500 and 300) are unique across all
 *   three cards in this test fixture, so no disambiguation is needed.
 *   Adding `data-testid="stat-card-value"` or an `aria-describedby` hook
 *   on StatCard would make value-scoped assertions straightforward.
 */
import { expect, test, type Page } from '@playwright/test';

// -----------------------------------------------------------------------------
// Deterministic mock state — entries drop from BEFORE_ENTRIES to AFTER_ENTRIES
// once the prune fires. Disk size + hit rate stay constant because only the
// stale-clear flow is under test here.
// -----------------------------------------------------------------------------
const BEFORE_ENTRIES = 1500;
const AFTER_ENTRIES = 300;
const REMOVED_COUNT = BEFORE_ENTRIES - AFTER_ENTRIES;
// StatCard renders totalEntries via Number#toLocaleString(). Playwright's
// browser context defaults to en-US, so we can hard-code the rendered form.
const BEFORE_ENTRIES_RENDERED = '1,500';
const AFTER_ENTRIES_RENDERED = '300';
// formatBytes(524_288) renders as "512.0 KB" — it always uses .toFixed(1) for
// KB/MB/GB tiers, so the label contains the decimal even for whole-number KB.
const DISK_SIZE_BYTES = 524_288;
const EXPECTED_DISK_LABEL = '512.0 KB';

// Usage stats feed the Hit Rate card. The UI uses cacheHitRate directly
// (0.24 → "24.0%").
const USAGE_STATS = {
  totalApiCalls: 500,
  totalCacheHits: 120,
  cacheHitRate: 0.24,
  totalCost: 1.0,
  avgCostPerCall: 0.002,
  totalInputTokens: 100_000,
  totalOutputTokens: 20_000,
};

type CacheState = {
  entries: number;
  clearCalls: number;
};

/**
 * Install REST mocks for the core-api cache routes the page calls. The
 * generated core Hey API client (`@pops/app-ai`) targets baseUrl `/core-api`,
 * which the shell proxy strips before forwarding to the core pillar:
 *   GET  /core-api/ai-usage/cache        — cache stats (entry count + disk size)
 *   GET  /core-api/ai-usage/stats        — usage roll-up (feeds the Hit Rate card)
 *   POST /core-api/ai-usage/cache/prune  — clear stale entries (Clear Stale button)
 *
 * The cache GET is driven by a mutable `state.entries` so the value drops from
 * BEFORE_ENTRIES to AFTER_ENTRIES once the prune POST fires.
 *
 * Returns a handle exposing the counter of prune invocations.
 */
async function installCacheMocks(page: Page): Promise<{ getClearCalls: () => number }> {
  const state: CacheState = { entries: BEFORE_ENTRIES, clearCalls: 0 };

  await page.route('**/core-api/ai-usage/cache', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ totalEntries: state.entries, diskSizeBytes: DISK_SIZE_BYTES }),
    });
  });

  await page.route('**/core-api/ai-usage/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(USAGE_STATS),
    });
  });

  await page.route('**/core-api/ai-usage/cache/prune', async (route) => {
    state.clearCalls += 1;
    state.entries = AFTER_ENTRIES;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ removed: REMOVED_COUNT }),
    });
  });

  return { getClearCalls: () => state.clearCalls };
}

test.describe('AI — cache management: view stats and clear stale entries', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];
  let cacheMocks: { getClearCalls: () => number } | null = null;

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];

    // Register crash detection BEFORE navigation so first-load errors surface.
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    cacheMocks = await installCacheMocks(page);

    await page.goto('/cerebrum/admin/cache');
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

  test('renders the Cache Management header and three stat cards', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Cache Management' })).toBeVisible({
      timeout: 10_000,
    });

    // Each StatCard title is rendered as an <h3>. Three cards → three headings.
    await expect(page.getByRole('heading', { level: 3, name: 'Total Entries' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { level: 3, name: 'Disk Size' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Hit Rate' })).toBeVisible();
  });

  test('displays initial stat values and disk size label', async ({ page }) => {
    // Values are unique across cards (1500, "512.0 KB", "24.0%") so a
    // page-scoped text locator unambiguously identifies each card's value.
    await expect(page.getByText(BEFORE_ENTRIES_RENDERED, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(EXPECTED_DISK_LABEL, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^24\.0%$/).first()).toBeVisible();
  });

  test('Clear Stale reduces the Total Entries value and surfaces a success toast', async ({
    page,
  }) => {
    // Wait for initial data to land — the "before" value is rendered.
    const beforeLocator = page.getByText(BEFORE_ENTRIES_RENDERED, { exact: true }).first();
    await expect(beforeLocator).toBeVisible({ timeout: 10_000 });

    // Sanity-check the stale-days input is at its default (30).
    const daysInput = page.getByLabel('Days threshold for stale entries');
    await expect(daysInput).toHaveValue('30');

    // Fire the prune mutation.
    await page.getByRole('button', { name: 'Clear Stale' }).click();

    // Success toast from sonner — filter to visible to avoid responsive dupes.
    await expect(
      page.getByText(`Removed ${REMOVED_COUNT} stale cache entries`).filter({ visible: true })
    ).toBeVisible({ timeout: 10_000 });

    // Total Entries re-fetches via cache-stats invalidation → new value renders.
    await expect(page.getByText(AFTER_ENTRIES_RENDERED, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Confirm the post-clear count is <= the prior count (contract from #2134).
    expect(AFTER_ENTRIES).toBeLessThanOrEqual(BEFORE_ENTRIES);

    // The mutation ran at least once for this click.
    expect(cacheMocks?.getClearCalls() ?? 0).toBeGreaterThanOrEqual(1);
  });
});
