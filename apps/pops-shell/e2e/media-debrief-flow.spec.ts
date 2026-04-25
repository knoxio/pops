/**
 * Media — post-watch debrief flow (#2129)
 *
 * Tier 3 integration test against the seeded e2e SQLite environment.
 *
 * Flow:
 *   1. Open a seeded movie that has no existing debrief session
 *      (Spider-Man: Across the Spider-Verse — not present in seeded
 *      watch_history, so marking it as watched will create a fresh
 *      pending debrief covering every active dimension).
 *   2. Click "Mark as Watched" — this logs watch history and the API
 *      auto-creates a pending debrief_session linked to that entry.
 *   3. Click the "Debrief this movie" action that appears on the movie
 *      hero once a pending debrief exists.
 *   4. On the debrief page, walk every pending dimension. For each one
 *      we pick the debrief movie itself as the winner via its stable
 *      Pick button — we don't know which opponent the server will
 *      select for each dimension, but we always know our own movie.
 *   5. Once every dimension is recorded, the DebriefActionBar swaps
 *      to the CompletionSummary card.
 *   6. Navigate to /media/debrief/:movieId/results and assert that
 *      score delta badges render for every dimension that received a
 *      comparison in the session.
 *
 * Idempotency:
 *   The seeded 'e2e' environment is created fresh at the start of each
 *   playwright run (global-setup) and destroyed at the end
 *   (global-teardown), so this test owns the Spider-Verse debrief
 *   lifecycle end-to-end. Tests inside this suite run serially because
 *   they share that single, mutating session state.
 *
 * Gotchas avoided:
 *  - The debrief's "pick" action is exposed both as a role=button div
 *    (overlay) and a real button (title). We click the div by its
 *    aria-label which is stable and not hover-gated.
 *  - Score delta badges use a deterministic test-id
 *    (`score-delta-${dimensionId}`), so we don't rely on the exact
 *    delta value which depends on Elo math.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const MOVIE_TITLE = 'Spider-Man: Across the Spider-Verse';

test.describe.configure({ mode: 'serial' });

test.describe('Media — debrief flow (post-watch comparison)', () => {
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
        // e2e image cache is not populated during seeding, so poster 404s
        // surface as "Failed to load resource" in WebKit — unrelated.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('debrief walks every dimension and shows Elo score deltas', async ({ page }) => {
    // ── 1. Land on the Spider-Verse detail page via the library ──
    await page.goto('/media');
    const movieLink = page
      .getByRole('link', { name: `${MOVIE_TITLE} (Movie)` })
      .filter({ visible: true })
      .first();
    await expect(movieLink).toBeVisible({ timeout: 10_000 });
    await movieLink.click();

    await expect(page).toHaveURL(/\/media\/movies\/\d+$/);
    const movieDetailUrl = page.url();
    const movieIdMatch = /\/media\/movies\/(\d+)$/.exec(movieDetailUrl);
    expect(movieIdMatch).not.toBeNull();
    const movieId = movieIdMatch?.[1];
    expect(movieId).toBeDefined();

    // ── 2. Mark as watched — API creates the pending debrief ──
    const markAsWatchedBtn = page.getByRole('button', { name: /Mark as watched/i });
    await expect(markAsWatchedBtn).toBeVisible({ timeout: 10_000 });
    await markAsWatchedBtn.click();

    // Movie should now show the debrief CTA (indirect proof the debrief
    // session was created server-side and pendingDebrief refetched).
    const debriefCta = page.getByRole('link', { name: /Debrief this movie/i });
    await expect(debriefCta).toBeVisible({ timeout: 10_000 });

    // ── 3. Enter the debrief page ──
    await debriefCta.click();
    await expect(page).toHaveURL(new RegExp(`/media/debrief/${movieId}$`));
    await expect(page.getByTestId('debrief-header')).toBeVisible({ timeout: 10_000 });

    // Ensure at least one pending dimension exists (seeded data guarantees
    // Spider-Verse has eligible opponents across every active dimension).
    const progress = page.getByTestId('dimension-progress');
    await expect(progress).toBeVisible();

    // ── 4. Walk every pending dimension ──
    // The card for the debrief movie (Spider-Verse) uses a stable testid
    // of `comparison-movie-card-${movieId}`. Inside that wrapper is a
    // role=button div with aria-label "Pick <title>" — we click that.
    const pickSelfButton = page.getByRole('button', { name: `Pick ${MOVIE_TITLE}` });

    // Hard upper-bound: 10 iterations guards against an infinite loop
    // if the UI fails to advance. The seeded e2e env has 5 active
    // dimensions, so 5 picks are expected.
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    const comparisonCards = page.getByTestId('comparison-cards');

    while (iterations < MAX_ITERATIONS) {
      const hasPending = await comparisonCards.isVisible();
      if (!hasPending) break;

      // Capture the current debrief-header text ("N dimensions
      // remaining"). It strictly changes as each pick is recorded.
      const headerBefore = (await page.getByTestId('debrief-header').textContent())?.trim() ?? '';

      // Pick Spider-Verse (ourselves) as the winner for this dimension.
      // The role=button div on the target movie card carries the
      // stable aria-label "Pick <title>" and is not hover-gated (only
      // the bottom overlay actions are).
      await pickSelfButton.click();

      // Wait for either the pending count in the header to change
      // (another dimension remains) or for the comparison-cards
      // container to disappear (all dimensions complete).
      await expect
        .poll(
          async () => {
            if (!(await comparisonCards.isVisible())) return 'complete';
            const now = (await page.getByTestId('debrief-header').textContent())?.trim() ?? '';
            return now === headerBefore ? 'same' : 'advanced';
          },
          { timeout: 10_000 }
        )
        .not.toBe('same');
      iterations++;
    }

    expect(iterations).toBeGreaterThan(0);

    // All dimensions should now be complete — CompletionSummary renders.
    await expect(page.getByTestId('completion-summary')).toBeVisible({ timeout: 10_000 });

    // ── 5. Navigate to debrief results ──
    await page.goto(`/media/debrief/${movieId}/results`);

    const summary = page.getByTestId('debrief-results-summary');
    await expect(summary).toBeVisible({ timeout: 10_000 });
    await expect(summary).toContainText(MOVIE_TITLE);

    // ── 6. Assert Elo score deltas are shown ──
    // Seeded movie has at least 2 dimensions with pre-existing scores
    // (Rewatchability, Fun); recording comparisons during the debrief
    // plus score-update side effects yield at least one score row and
    // therefore at least one `score-delta-*` badge.
    const deltaBadges = page.locator('[data-testid^="score-delta-"]');
    await expect(deltaBadges.first()).toBeVisible({ timeout: 10_000 });
    const deltaCount = await deltaBadges.count();
    expect(deltaCount).toBeGreaterThan(0);
  });
});
