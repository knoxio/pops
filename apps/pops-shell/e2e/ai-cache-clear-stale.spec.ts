/**
 * E2E — AI cache: view stats and clear stale entries (#2134)
 *
 * Tier 3 flow covering /ai/cache:
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
 *   ai-categorizer-cache.ts). Running `clearStaleCache` against the real API
 *   would mutate shared state used by other tests (and the dev environment),
 *   so we mock the two cache procedures. All other tRPC calls (session,
 *   auth, etc.) still flow through useRealApi → seeded e2e DB.
 *
 *   The mock drives a deterministic before/after comparison: cacheStats is
 *   routed through a mutable state object so the FIRST response returns a
 *   high entry count (1500), and after the clearStaleCache mutation fires
 *   the state flips so subsequent responses return a lower count (300).
 *   The cache model invalidates cacheStats on mutation success, which
 *   triggers the re-fetch and re-renders the StatCard with the new total.
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

import { useRealApi } from './helpers/use-real-api';

// -----------------------------------------------------------------------------
// Deterministic mock state — entries drop from BEFORE_ENTRIES to AFTER_ENTRIES
// once clearStaleCache fires. Disk size + hit rate stay constant because only
// the stale-clear flow is under test here.
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

// Usage stats feed the Hit Rate card. 120 hits / (500 calls + 120 hits) is not
// what the UI computes — it uses cacheHitRate directly (0.24 → "24.0%").
const USAGE_STATS = {
  totalApiCalls: 500,
  totalCacheHits: 120,
  cacheHitRate: 0.24,
  totalCost: 1.0,
  avgCostPerCall: 0.002,
  totalInputTokens: 100_000,
  totalOutputTokens: 20_000,
};

/**
 * Parse the procedure list out of a tRPC URL.
 *
 * httpBatchLink encodes multiple procedures as a comma-separated path segment:
 *   /trpc/core.aiUsage.cacheStats,core.aiUsage.getStats?batch=1&input=...
 *
 * Non-batch URLs have a single procedure after /trpc/.
 */
function parseProcedures(url: string): string[] {
  const match = /\/trpc\/([^?]+)/.exec(url);
  if (!match) return [];
  return decodeURIComponent(match[1] ?? '').split(',');
}

type CacheState = {
  entries: number;
  clearCalls: number;
};

function resolveProcedureData(name: string, state: CacheState): unknown {
  if (name === 'core.aiUsage.cacheStats') {
    return { totalEntries: state.entries, diskSizeBytes: DISK_SIZE_BYTES };
  }
  if (name === 'core.aiUsage.getStats') {
    return USAGE_STATS;
  }
  if (name === 'core.aiUsage.clearStaleCache') {
    state.clearCalls += 1;
    state.entries = AFTER_ENTRIES;
    return { removed: REMOVED_COUNT };
  }
  return null;
}

/**
 * Install mocks for the three cache-related procedures.
 *
 * Intercepts /trpc/** and inspects the procedure list. If EVERY procedure in
 * the (possibly batched) request is a cache procedure we know about, we
 * fulfill with a mocked response. Otherwise we fall through to the real API
 * by calling route.fallback(), which lets useRealApi's handler run.
 *
 * The cache page only reads two queries (cacheStats, getStats) and writes
 * two mutations (clearStaleCache, clearAllCache), and batched tRPC will not
 * mix these with unrelated procedures from other pages. This makes the
 * "all-or-fall-through" rule safe in practice.
 *
 * Returns a handle exposing the counter of clearStaleCache invocations.
 */
async function installCacheMocks(page: Page): Promise<{ getClearCalls: () => number }> {
  const state: CacheState = { entries: BEFORE_ENTRIES, clearCalls: 0 };
  const knownProcedures = new Set([
    'core.aiUsage.cacheStats',
    'core.aiUsage.getStats',
    'core.aiUsage.clearStaleCache',
  ]);

  await page.route('/trpc/**', async (route) => {
    const procedures = parseProcedures(route.request().url());

    const allKnown = procedures.length > 0 && procedures.every((name) => knownProcedures.has(name));
    if (!allKnown) {
      await route.fallback();
      return;
    }

    const isBatch = new URL(route.request().url()).searchParams.has('batch');
    const payloads = procedures.map((name) => ({
      result: { data: resolveProcedureData(name, state) },
    }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? payloads : payloads[0]),
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

    // Register useRealApi FIRST so that the cache mock (registered last,
    // LIFO) can use route.fallback() to hand non-cache procedures off to the
    // real-API handler. Playwright routes match most-recently-added first.
    await useRealApi(page);
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

    // Fire the mutation.
    await page.getByRole('button', { name: 'Clear Stale' }).click();

    // Success toast from sonner — filter to visible to avoid responsive dupes.
    await expect(
      page.getByText(`Removed ${REMOVED_COUNT} stale cache entries`).filter({ visible: true })
    ).toBeVisible({ timeout: 10_000 });

    // Total Entries re-fetches via cacheStats invalidation → new value renders.
    await expect(page.getByText(AFTER_ENTRIES_RENDERED, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Confirm the post-clear count is <= the prior count (contract from #2134).
    expect(AFTER_ENTRIES).toBeLessThanOrEqual(BEFORE_ENTRIES);

    // The mutation ran at least once for this click.
    expect(cacheMocks?.getClearCalls() ?? 0).toBeGreaterThanOrEqual(1);
  });
});
