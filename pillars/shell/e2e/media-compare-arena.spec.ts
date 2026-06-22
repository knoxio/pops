/**
 * E2E — Media compare arena: record one comparison pair (#2118)
 *
 * Tier 2 flow: navigate to /media/compare, wait for a seeded pair to render,
 * pick a winner, confirm the outcome is recorded (session-count badge ticks
 * to 1), then visit /media/rankings and confirm both movies appear with a
 * score cell.
 *
 * Seed context (see apps/pops-api/src/db/seeder.ts):
 *   Smart-pair candidates are the intersection of watched movies and the
 *   non-watchlisted pool, which in the e2e seed reduces to five watched
 *   titles: Shawshank, Godfather, Dark Knight, Pulp Fiction, LOTR. The seed
 *   also inserts pre-computed scores across five dimensions, so the rankings
 *   page is non-empty from the moment the env is created.
 *
 * Idempotency:
 *   This flow is append-only — every run writes one row to the `comparisons`
 *   table in the e2e SQLite DB, and the picked movie's Elo score drifts up
 *   by roughly one K-factor step. The test does not rely on any exact score
 *   value; it only asserts that both movies render on the rankings page with
 *   a visible score cell, so accumulation across runs is tolerated. The
 *   session-count badge assertion (`"1"`) is safe because sessionCount is an
 *   in-memory React state reset on every page load.
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies no uncaught JS error occurs.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

/**
 * Wait for the arena to present a real pair of cards and return the two
 * titles as they appear in the DOM. We resolve the titles from the "Pick
 * {title}" accessible name on the card poster (CardWithActionOverlay renders
 * the poster as `role="button"` with that aria-label) rather than hard-coding
 * candidates, because the smart-pair selector samples randomly from the
 * eligible pool and we cannot predict which pair the API will hand back.
 */
async function readPairTitles(page: Page): Promise<[string, string]> {
  const pickButtons = page.getByRole('button', { name: /^Pick / });
  await expect(pickButtons).toHaveCount(2, { timeout: 15_000 });
  const names = await pickButtons.evaluateAll((nodes) =>
    nodes.map((n) => (n.getAttribute('aria-label') ?? '').replace(/^Pick /, ''))
  );
  const [a, b] = names;
  if (!a || !b) throw new Error(`Expected two pair titles, got: ${JSON.stringify(names)}`);
  return [a, b];
}

test.describe('Media — compare arena records one pair', () => {
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
        // WebKit logs failed <img> loads (poster images) as console.error; the
        // e2e image cache is not populated during seeding, so 404s are expected
        // and unrelated to the comparison flow under test.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('records a winner from the arena pair and surfaces both movies on /media/rankings', async ({
    page,
  }) => {
    await page.goto('/media/compare');
    await expect(page.getByRole('heading', { level: 1, name: 'Arena' })).toBeVisible({
      timeout: 10_000,
    });

    // Seed provides 5 dimensions — the dimension picker renders a native
    // <select>. Scope the combobox lookup to its aria-label so it doesn't
    // clash with any other selects that might appear in the layout.
    await expect(page.getByRole('combobox', { name: 'Comparison dimension' })).toBeVisible({
      timeout: 10_000,
    });

    const [titleA, titleB] = await readPairTitles(page);

    // ArenaPair renders each ComparisonMovieCard with two click targets:
    // 1) The poster overlay — role="button", aria-label="Pick {title}"
    // 2) A title `<button>` below the poster with the raw title as its
    //    accessible name.
    // The title button is always visible (no hover required), so it avoids
    // the WebKit hover-gated click flakiness that bites the poster overlay.
    const winnerButton = page.getByRole('button', { name: titleA, exact: true });
    await expect(winnerButton).toBeVisible();
    await winnerButton.click();

    // "Outcome recorded" is signaled by two distinct UI changes driven by
    // the `media.comparisons.record` mutation's onSuccess handler:
    //   - sessionCount state increments → ArenaHeader renders a new outline
    //     badge with the count (starts hidden at 0, appears at 1).
    //   - getSmartPair query is invalidated and a new pair is fetched.
    // The badge is the most deterministic signal — it does not depend on the
    // API returning a fresh pair in time and is not cleared by the 1.5s
    // score-delta timer.
    const sessionBadge = page.getByText('1', { exact: true });
    await expect(sessionBadge.first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/media/rankings');
    await expect(page.getByRole('heading', { level: 1, name: 'Rankings' })).toBeVisible({
      timeout: 10_000,
    });

    // RankingRow renders each entry as an <h3> with the movie title plus a
    // dedicated score block. Both movies from the pair should be present in
    // the leaderboard — the picked winner because it just gained Elo, and
    // the loser because the seed (and/or prior runs) already placed it
    // there. Assert on the <h3> heading to avoid matching poster alt text.
    const winnerHeading = page.getByRole('heading', { level: 3, name: titleA });
    const loserHeading = page.getByRole('heading', { level: 3, name: titleB });
    await expect(winnerHeading).toBeVisible({ timeout: 10_000 });
    await expect(loserHeading).toBeVisible({ timeout: 10_000 });

    // Score cells render as tabular-nums integers inside the same row as the
    // heading. Walk up to the RankingRow outer container (the only ancestor
    // with a `rounded-lg border` class) and assert each row contains a
    // numeric score cell, so the test fails loudly if the rankings API ever
    // returns titles without scores. Using the `rounded-lg` anchor avoids
    // the generic `flex` prefix that also matches the inner `flex-1` meta
    // div.
    async function assertRowHasScore(heading: ReturnType<typeof page.getByRole>) {
      const row = heading.locator('xpath=ancestor::div[contains(@class, "rounded-lg")][1]');
      await expect(row.getByText(/^\d+$/).first()).toBeVisible({ timeout: 10_000 });
    }
    await assertRowHasScore(winnerHeading);
    await assertRowHasScore(loserHeading);
  });
});
