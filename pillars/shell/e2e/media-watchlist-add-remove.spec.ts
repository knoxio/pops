/**
 * E2E — Media watchlist: add and remove an item (#2116)
 *
 * Tier 2 flow: navigate to a seeded movie detail page, click "Add to
 * Watchlist", visit /media/watchlist, confirm the movie appears, then remove
 * it via the detail page toggle and confirm it no longer appears in the
 * watchlist list.
 *
 * Seed context (see apps/pops-api/src/db/seeder.ts):
 *   The seeded watchlist contains Matrix, Interstellar, Fight Club (movies)
 *   and Shogun (TV). Forrest Gump is NOT seeded onto the watchlist and NOT in
 *   watch_history, so it is the natural candidate for "add a fresh item".
 *
 * Removal surface:
 *   The WatchlistCard exposes a per-item remove button, but it is styled
 *   `opacity-0 group-hover:opacity-100` and positioned over the poster div,
 *   whose own click handler navigates to the detail page. On WebKit the
 *   pointer move synthesized by Playwright's `.click()` can race the CSS
 *   transition so the click resolves against the underlying poster div
 *   instead of the button, causing an unintended navigation. To avoid the
 *   race, this test drives removal via the detail-page WatchlistToggle —
 *   which is always visible and surfaces the same success toast via
 *   useWatchlistToggleModel → useRemoveMutation.
 *
 * Idempotency:
 *   The test removes the entry it creates at the end of the flow, restoring
 *   the watchlist to its starting state. If a prior run was interrupted and
 *   left Forrest Gump on the list, the "Add to Watchlist" toggle will instead
 *   read "On Watchlist" on arrival — the test handles both starting states
 *   by asserting the final state (not present) regardless of the initial
 *   condition.
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies no uncaught JS error occurs.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

/** Seeded movie that is NOT on the watchlist and NOT in watch history. */
const MOVIE_TITLE = 'Forrest Gump';

/**
 * Open the target movie's detail page from the library grid.
 *
 * Navigating via /media (rather than hard-coding /media/movies/:id) keeps the
 * test decoupled from the DB auto-increment id of the seeded row. The
 * MediaCard link exposes `${title} (Movie)` as its accessible name.
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
 * Ensure the WatchlistToggle on the detail page reflects "not on watchlist".
 * If a previous run left the item on the list, remove it first so the test
 * starts from a known clean state.
 */
async function ensureNotOnWatchlist(page: Page): Promise<void> {
  // Wait for the toggle to resolve its initial status query — until then it
  // renders a "Checking watchlist status" placeholder.
  await expect(page.getByRole('button', { name: /Checking watchlist status/i })).toHaveCount(0, {
    timeout: 10_000,
  });

  const removeButton = page.getByRole('button', { name: 'Remove from watchlist' });
  if ((await removeButton.count()) > 0) {
    await removeButton.click();
    await expect(page.getByRole('button', { name: 'Add to watchlist' })).toBeVisible({
      timeout: 10_000,
    });
  } else {
    await expect(page.getByRole('button', { name: 'Add to watchlist' })).toBeVisible({
      timeout: 10_000,
    });
  }
}

test.describe('Media — watchlist add and remove', () => {
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
        // WebKit logs failed <img> loads (e.g. poster images) as console.error.
        // The e2e image cache is not populated during seeding, so 404s are
        // expected and unrelated to the watchlist flow under test.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('adds a movie to the watchlist from the detail page and removes it from the list', async ({
    page,
  }) => {
    await openMovieDetail(page, MOVIE_TITLE);
    await ensureNotOnWatchlist(page);

    // Click "Add to Watchlist" — the optimistic update flips the toggle to
    // "On Watchlist" and a success toast surfaces.
    const addButton = page.getByRole('button', { name: 'Add to watchlist' });
    await addButton.click();
    await expect(page.getByRole('button', { name: 'Remove from watchlist' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Added to watchlist').first()).toBeVisible({ timeout: 10_000 });

    // Navigate to the watchlist page and confirm the movie is present.
    // WatchlistCard (desktop) and WatchlistItem (mobile) both render the
    // title in an <h3>; a semantic heading locator covers both viewports.
    await page.goto('/media/watchlist');
    await expect(page.getByRole('heading', { name: 'Watchlist', level: 1 })).toBeVisible();
    const titleHeading = page.getByRole('heading', { level: 3, name: MOVIE_TITLE });
    await expect(titleHeading).toBeVisible({ timeout: 10_000 });

    // Remove from the watchlist via the detail page's WatchlistToggle. The
    // per-card remove button on WatchlistCard sits at `absolute bottom-2
    // right-2` with `opacity-0 group-hover:opacity-100`; on WebKit the
    // synthesized pointer move during `.click()` can race the CSS transition
    // and the click lands on the underlying poster div (which navigates to
    // the detail page) instead of firing `onRemove`. The detail page toggle
    // is always visible and fires the same `toast.success('Removed from
    // watchlist')` via useWatchlistToggleModel → useRemoveMutation.
    await openMovieDetail(page, MOVIE_TITLE);
    const removeFromDetail = page.getByRole('button', { name: 'Remove from watchlist' });
    await expect(removeFromDetail).toBeVisible({ timeout: 10_000 });
    await removeFromDetail.click();
    await expect(page.getByRole('button', { name: 'Add to watchlist' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Removed from watchlist').first()).toBeVisible({
      timeout: 10_000,
    });

    // Confirm the entry is gone from the watchlist list.
    await page.goto('/media/watchlist');
    await expect(page.getByRole('heading', { name: 'Watchlist', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: MOVIE_TITLE })).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
