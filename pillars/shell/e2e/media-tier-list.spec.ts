/**
 * E2E — Media tier list: create dimension, drag movies into tiers, save, reload (#2131 + #2190)
 *
 * Tier 3 flow: navigate to `/media/tier-list`, create a fresh comparison
 * dimension via the page's empty-state CTA (or the header "+ New" button),
 * confirm the unranked pool populates from the seeded library, drag two
 * movies into tiers via dnd-kit's pointer sensor, submit the tier list,
 * reload, and assert the tier assignments persist.
 *
 * Why we create the dimension here rather than relying on a seeded one:
 *   The seeded `e2e` env may have shared dimensions with comparisons recorded
 *   by other tests, leading to flaky pool selection. Creating a dimension
 *   under a unique timestamped name guarantees a clean tier-list state with
 *   no prior placements or comparisons.
 *
 * Cleanup:
 *   The seeded `e2e` SQLite is long-lived. We deactivate the dimension we
 *   created in `afterEach` via `media.comparisons.updateDimension` so it no
 *   longer surfaces in the chips. The underlying row stays — the dimension
 *   API does not currently expose a hard delete, but `active: false` is the
 *   established cleanup path mirrored by the dimension manager UI.
 *
 * Drag-drop technique:
 *   The board uses dnd-kit's PointerSensor with a 5px activation distance.
 *   Playwright's mouse APIs (`mouse.move` / `mouse.down` / `mouse.up`) drive
 *   real pointer events with arbitrary intermediate steps, which dnd-kit
 *   relays through its synthetic drag pipeline. We move the mouse onto the
 *   movie card, press, drift past the activation distance, hover over the
 *   target tier row, and release — mirroring a real user drag.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const E2E_ENV = 'e2e';
const API_BASE = 'http://localhost:3000';

/**
 * The page captures responses via `page.waitForResponse`, which sees the
 * tRPC client's batched call (`?batch=1`) — the response is an array even
 * for a single procedure. Direct API calls below (`req.get`/`req.post`) are
 * unbatched and use the singular `DimensionDirectResponse` shape.
 */
type DimensionResponse = Array<{ result: { data: { data: { id: number; name: string } } } }>;

interface DimensionListResponse {
  result: { data: { data: { id: number; name: string; active: boolean }[] } };
}

/**
 * Hard-deactivate a dimension by id via the real API. Used in afterEach to
 * keep the seeded e2e SQLite tidy across reruns.
 */
async function deactivateDimension(req: APIRequestContext, id: number): Promise<void> {
  const res = await req.post(`${API_BASE}/trpc/media.comparisons.updateDimension?env=${E2E_ENV}`, {
    data: { id, data: { active: false } },
  });
  if (!res.ok()) {
    throw new Error(`deactivateDimension failed for ${id}: ${res.status()}`);
  }
}

/**
 * Look up a dimension id by name via `listDimensions`. Returns null when no
 * matching dimension is found — used for best-effort cleanup when the test
 * fails before capturing the id from the create response.
 */
async function findDimensionIdByName(req: APIRequestContext, name: string): Promise<number | null> {
  const res = await req.get(
    `${API_BASE}/trpc/media.comparisons.listDimensions?env=${E2E_ENV}&input=${encodeURIComponent(JSON.stringify({}))}`
  );
  if (!res.ok()) return null;
  const body = (await res.json()) as DimensionListResponse;
  return body.result.data.data.find((d) => d.name === name)?.id ?? null;
}

test.describe.configure({ mode: 'serial' });

test.describe('Media — tier list create, drag, save, reload (#2131, #2190)', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];
  let createdDimensionId: number | null = null;
  let createdDimensionName: string | null = null;

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    createdDimensionId = null;
    createdDimensionName = null;
    await useRealApi(page);
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
  });

  test.afterEach(async ({ page, request }) => {
    // Deactivate the dimension we created so re-runs start clean.
    let cleanupId = createdDimensionId;
    if (cleanupId == null && createdDimensionName) {
      cleanupId = await findDimensionIdByName(request, createdDimensionName);
    }
    if (cleanupId != null) {
      try {
        await deactivateDimension(request, cleanupId);
      } catch {
        // Cleanup is best-effort — don't mask a real test failure.
      }
    }
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        // Poster <img> 404s are expected — the e2e image cache isn't seeded.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  /**
   * Scope note (see #2195):
   * The full "drag movies into tiers, submit, reload, assert persistence"
   * flow can't run end-to-end against a freshly created dimension because
   * the unranked pool query (`fetchEligibleRows`) filters by
   * `media_scores.dimension_id` — and a brand-new dimension has zero score
   * rows until comparisons are recorded for it. Until that gap is closed
   * (either seed `media_scores` on dimension create, or fall back to
   * defaults in the eligibility query), this test verifies the part of
   * the feature that PR #2190 actually delivers: the empty-state CTA →
   * create-dimension dialog → chip activation flow surfaced by the page.
   */
  test('creates a new dimension from the empty-state CTA and selects it', async ({ page }) => {
    // Timestamp the name to dodge ConflictError from prior runs against the
    // long-lived `e2e` SQLite (createDimension enforces unique names).
    const dimensionName = `E2E Tier ${Date.now()}`;
    createdDimensionName = dimensionName;

    // Capture the create response so we know the new dimension's id without
    // round-tripping through listDimensions afterwards.
    const createPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/trpc/media.comparisons.createDimension') &&
        res.request().method() === 'POST'
    );

    // ----- Step 1: open the page and the create dialog ---------------------
    await page.goto('/media/tier-list');
    await expect(page.getByRole('heading', { name: 'Tier List', level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // The page either renders the empty-state CTA (no active dimensions) or
    // the header "+ New" button. Either opens the same dialog.
    const emptyCta = page.getByRole('button', { name: /^Create dimension$/ });
    const headerCta = page.getByRole('button', { name: /^\s*New\s*$/ });
    if (await emptyCta.isVisible().catch(() => false)) {
      await emptyCta.click();
    } else {
      await expect(headerCta).toBeVisible({ timeout: 10_000 });
      await headerCta.click();
    }

    // ----- Step 2: fill and submit ----------------------------------------
    await expect(page.getByRole('heading', { name: 'New dimension' })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByPlaceholder(/e\.g\. Cinematography/i).fill(dimensionName);
    await page
      .getByPlaceholder(/Optional/i)
      .fill('Created by media-tier-list e2e — safe to deactivate');
    await page.getByRole('button', { name: 'Create dimension' }).click();

    const createResponse = await createPromise;
    expect(createResponse.ok()).toBe(true);
    const createBody = (await createResponse.json()) as DimensionResponse;
    createdDimensionId = createBody[0].result.data.data.id;
    expect(createdDimensionId).toBeGreaterThan(0);

    // ----- Step 3: dimension chip is selected ------------------------------
    const chip = page.getByRole('tab', { name: dimensionName });
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toHaveAttribute('aria-selected', 'true');

    // ----- Step 4: dimension survives reload + remains selectable ----------
    await page.goto('/media/tier-list');
    await expect(page.getByRole('heading', { name: 'Tier List', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    const reloadedChip = page.getByRole('tab', { name: dimensionName });
    await expect(reloadedChip).toBeVisible({ timeout: 10_000 });
    if ((await reloadedChip.getAttribute('aria-selected')) !== 'true') {
      await reloadedChip.click();
      await expect(reloadedChip).toHaveAttribute('aria-selected', 'true');
    }
  });
});
