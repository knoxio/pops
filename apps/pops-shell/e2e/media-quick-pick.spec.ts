/**
 * E2E — Media quick pick: generate picks and add one to watchlist (#2130)
 *
 * Tier 3 flow: navigate to `/media/quick-pick`, confirm cards render, change
 * the count selector and verify the displayed card count tracks it, then pick
 * one card, navigate to its detail page via the "Watch This" button, add it
 * to the watchlist, and confirm it appears on `/media/watchlist`.
 *
 * Seed context (apps/pops-api/src/db/seeder.ts):
 *   `quickPick` filters out movies with completed watch_history rows. The
 *   seeded pool starts at 5 unwatched movies (Forrest Gump, Fight Club, The
 *   Matrix, Interstellar, Spider-Verse), but other specs running earlier in
 *   the session — notably `media-debrief-flow` — also mark movies as watched,
 *   so the pool can be smaller by the time this spec runs. The count
 *   assertions therefore target a small N that the pool can always satisfy
 *   (count=2 with a >=2 pool always shows exactly 2 cards) rather than
 *   asserting the max. Of the 5, Fight Club / The Matrix / Interstellar are
 *   seeded onto the watchlist already; Forrest Gump and Spider-Verse are
 *   NOT — but the picker is random so any may surface. The test handles
 *   both starting states ("Add to watchlist" vs already-on) symmetrically.
 *
 * Cleanup:
 *   The seeded `e2e` env is long-lived, so the test removes any watchlist
 *   entry it added in `afterEach`. If the picked title was already on the
 *   watchlist at the start, the test leaves it there (it didn't add it).
 *
 * Why we click "Watch This" rather than a direct "Add to Watchlist" button:
 *   QuickPickPage cards expose only a "Watch This" link (no inline watchlist
 *   action). The watchlist toggle lives on the movie detail page, mirroring
 *   the flow exercised by `media-watchlist-add-remove.spec.ts`.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

/**
 * Open the movie detail page for a given title via the library grid. Decoupled
 * from the auto-increment id of the seeded row.
 */
async function openMovieDetail(page: Page, title: string): Promise<void> {
  await page.goto('/media');
  const card = page.getByRole('link', { name: `${title} (Movie)` });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();
  await expect(page).toHaveURL(/\/media\/movies\/\d+/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/**
 * Wait for the toggle to resolve its initial query (it renders a "Checking
 * watchlist status" placeholder while the underlying tRPC call is in flight)
 * and report whether the picked title was already on the watchlist.
 */
async function watchlistStartingState(page: Page): Promise<'on' | 'off'> {
  await expect(page.getByRole('button', { name: /Checking watchlist status/i })).toHaveCount(0, {
    timeout: 10_000,
  });
  const removeButton = page.getByRole('button', { name: 'Remove from watchlist' });
  return (await removeButton.count()) > 0 ? 'on' : 'off';
}

/** Locate a count toggle button in the Quick Pick header. */
function countButton(page: Page, n: number) {
  return page.getByRole('group', { name: 'Number of picks' }).getByRole('button', { name: `${n}` });
}

test.describe('Media — quick pick generate and add to watchlist (#2130)', () => {
  test.describe.configure({ mode: 'serial' });

  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];
  // Tracks whether we ourselves added the picked title (and therefore must
  // remove it again on cleanup). When the title was already on the watchlist
  // at the start of the test, we leave it in place.
  let addedTitle: string | null = null;

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    addedTitle = null;
    await useRealApi(page);
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
  });

  test.afterEach(async ({ page }) => {
    // Best-effort cleanup: if we added an entry, remove it via the detail
    // page toggle so re-runs start from the seeded state. Wrapped in a
    // try/catch so cleanup failure never masks a real test failure.
    if (addedTitle) {
      try {
        await openMovieDetail(page, addedTitle);
        const removeButton = page.getByRole('button', { name: 'Remove from watchlist' });
        if ((await removeButton.count()) > 0) {
          await removeButton.click();
          await expect(page.getByRole('button', { name: 'Add to watchlist' })).toBeVisible({
            timeout: 10_000,
          });
        }
      } catch {
        // Cleanup is best-effort.
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

  test('generates picks, count toggle narrows the grid, and adding a pick lands it on the watchlist', async ({
    page,
  }) => {
    // ----- Step 1: navigate, confirm picks render --------------------------
    await page.goto('/media/quick-pick');
    await expect(page.getByRole('heading', { name: 'Quick Pick', level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Default count is 3 — the URL search param drives the query and the
    // selected button reflects via aria-pressed. Wait for the grid to
    // populate (skeletons disappear) before counting cards. The pool has
    // shrunk in earlier sessions (debrief flow marks movies watched), so
    // assert at-least-2 rather than exactly-3.
    await expect(countButton(page, 3)).toHaveAttribute('aria-pressed', 'true');
    const watchThis = page.getByRole('button', { name: /^Watch This$/ });
    await expect(watchThis.first()).toBeVisible({ timeout: 10_000 });
    const initialCount = await watchThis.count();
    expect(initialCount).toBeGreaterThanOrEqual(2);

    // ----- Step 2: change count to 2 and verify cards track ----------------
    // count=2 reliably returns exactly 2 even when the unwatched pool has
    // shrunk to its minimum, so this is the strict equality assertion.
    await countButton(page, 2).click();
    await expect(countButton(page, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]count=2(&|$)/);
    await expect(watchThis).toHaveCount(2, { timeout: 10_000 });

    // ----- Step 3: capture the first pick's title --------------------------
    // Each pick wraps a MediaCard whose accessible name is `${title} (Movie)`.
    // We pull the title off the first card so we can assert against it on the
    // watchlist later.
    const firstCardLink = page.getByRole('link', { name: /\(Movie\)$/ }).first();
    const accessibleName = await firstCardLink.getAttribute('aria-label');
    if (!accessibleName) throw new Error('Quick pick card missing aria-label');
    const pickedTitle = accessibleName.replace(/ \(Movie\)$/, '');

    // ----- Step 4: open detail page via "Watch This" and add to watchlist --
    // Click the "Watch This" button paired with the captured card. Because
    // the grid layout is `space-y-2` per pick, the nth Watch This button
    // matches the nth card.
    await watchThis.first().click();
    await expect(page).toHaveURL(/\/media\/movies\/\d+/);
    await expect(page.getByRole('heading', { level: 1, name: pickedTitle })).toBeVisible();

    const startingState = await watchlistStartingState(page);
    if (startingState === 'off') {
      const addButton = page.getByRole('button', { name: 'Add to watchlist' });
      await addButton.click();
      await expect(page.getByRole('button', { name: 'Remove from watchlist' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText('Added to watchlist').first()).toBeVisible({ timeout: 10_000 });
      addedTitle = pickedTitle;
    }

    // ----- Step 5: confirm presence on /media/watchlist --------------------
    // WatchlistCard / WatchlistItem render the title in an <h3> on both
    // viewports — a semantic heading locator covers both renderers.
    await page.goto('/media/watchlist');
    await expect(page.getByRole('heading', { name: 'Watchlist', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: pickedTitle })).toBeVisible({
      timeout: 10_000,
    });
  });
});
