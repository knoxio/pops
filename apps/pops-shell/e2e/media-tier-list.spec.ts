/**
 * E2E — Media tier list (#2131, #2190, #2195)
 *
 * Two scenarios live in this file:
 *
 * 1. **Create dimension from empty-state CTA** (#2131 + #2190).
 *    Creates a fresh, timestamped dimension via the page's CTA, confirms
 *    the chip activates, and verifies the dimension survives a reload.
 *    Stops short of the full drag flow because a brand-new dimension has
 *    no `media_scores` rows yet, so `fetchEligibleRows` returns nothing.
 *
 * 2. **Persisted placements survive reload** (#2195).
 *    Uses the seeded `Cinematography` dimension (which has 4 scored movies)
 *    to exercise the full drag → submit → reload → assert flow. After
 *    submitting, the page is reloaded and the test asserts that the same
 *    movies are still rendered inside their assigned tier rows. This is
 *    the gap closed by #2195 — `tier_overrides` is now read back into the
 *    board on hydration.
 *
 * Drag-drop technique:
 *   The board uses dnd-kit's PointerSensor with a 5px activation distance.
 *   Playwright's `mouse.move` / `mouse.down` / `mouse.up` drive real pointer
 *   events with arbitrary intermediate steps, which dnd-kit relays through
 *   its synthetic drag pipeline.
 *
 * Cleanup:
 *   The seeded `e2e` SQLite is long-lived. The first test deactivates the
 *   dimension it created in `afterEach`. The second test relies on
 *   `tier_overrides`'s upsert semantics — a re-run replaces prior placements
 *   for the same (mediaId, dimensionId), so leaving overrides behind is
 *   self-healing across runs.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

/**
 * Drive a dnd-kit PointerSensor drag from the source movie card to the named
 * target drop zone. The 5px activation constraint requires at least one
 * intermediate move past 5px before the drop element starts tracking.
 */
async function dragMovieToTier(
  page: Page,
  movieTitle: string,
  tier: 'S' | 'A' | 'B' | 'C' | 'D'
): Promise<void> {
  const card = page.locator(`[aria-label="${movieTitle}"]`).first();
  const target = page.locator(`[aria-label="Tier ${tier}"]`).first();

  await card.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  if (!cardBox) throw new Error(`bounding box missing for movie card "${movieTitle}"`);
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error(`bounding box missing for tier "${tier}"`);

  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // dnd-kit PointerSensor activates after 5px — 10px nudge is comfortably past it.
  await page.mouse.move(startX + 10, startY + 10, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 15 });
  await page.mouse.up();
}

test.describe('Media — tier list placements survive reload (#2195)', () => {
  // The seeded Cinematography dimension has 4 movies with media_scores rows
  // (Shawshank, Godfather, Dark Knight, Interstellar) so the unranked pool is
  // populated immediately — no need to seed scores ourselves.
  const DIMENSION_NAME = 'Cinematography';
  const MOVIE_S = 'The Shawshank Redemption';
  const MOVIE_B = 'The Dark Knight';

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

  test('places movies in S/B, submits, then reload shows them still in S/B', async ({ page }) => {
    // ----- Step 1: navigate and select Cinematography ----------------------
    await page.goto('/media/tier-list');
    await expect(page.getByRole('heading', { name: 'Tier List', level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    const dimensionChip = page.getByRole('tab', { name: DIMENSION_NAME });
    await expect(dimensionChip).toBeVisible({ timeout: 10_000 });
    if ((await dimensionChip.getAttribute('aria-selected')) !== 'true') {
      await dimensionChip.click();
      await expect(dimensionChip).toHaveAttribute('aria-selected', 'true');
    }

    // The board should render at least the two movies we want to place. They
    // may already be in S / B from a prior run (tier_overrides is upserted),
    // which is fine — the reload assertion checks final state, not that the
    // drag itself moved anything.
    await expect(page.getByRole('button', { name: /^Submit Tier List/i })).toBeVisible({
      timeout: 15_000,
    });

    // ----- Step 2: drag both movies into their tiers -----------------------
    // If the movie is already inside the target tier from a prior run, the
    // mouse move ends inside that tier and dnd-kit treats it as a no-op.
    await dragMovieToTier(page, MOVIE_S, 'S');
    await dragMovieToTier(page, MOVIE_B, 'B');

    // ----- Step 3: submit ---------------------------------------------------
    const submitBtn = page.getByRole('button', { name: /^Submit Tier List/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    const submitResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/trpc/media.comparisons.submitTierList') &&
        res.request().method() === 'POST'
    );
    await submitBtn.click();
    const submitRes = await submitResponse;
    expect(submitRes.ok()).toBe(true);

    // After submit the page switches to the TierListSummary view.
    await expect(page.getByText(/comparisons/i).first()).toBeVisible({ timeout: 10_000 });

    // ----- Step 4: reload and re-select the dimension ----------------------
    await page.goto('/media/tier-list');
    await expect(page.getByRole('heading', { name: 'Tier List', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    const reloadedChip = page.getByRole('tab', { name: DIMENSION_NAME });
    await expect(reloadedChip).toBeVisible({ timeout: 10_000 });
    if ((await reloadedChip.getAttribute('aria-selected')) !== 'true') {
      await reloadedChip.click();
      await expect(reloadedChip).toHaveAttribute('aria-selected', 'true');
    }

    // ----- Step 5: assert placements survived ------------------------------
    const tierS = page.locator('[aria-label="Tier S"]').first();
    const tierB = page.locator('[aria-label="Tier B"]').first();

    await expect(tierS.locator(`[aria-label="${MOVIE_S}"]`)).toBeVisible({ timeout: 10_000 });
    await expect(tierB.locator(`[aria-label="${MOVIE_B}"]`)).toBeVisible({ timeout: 10_000 });
  });
});
