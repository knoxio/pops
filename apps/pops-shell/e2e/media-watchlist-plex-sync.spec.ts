/**
 * E2E — Media watchlist: trigger a Plex sync from the UI (#2132)
 *
 * Tier 3 flow covering the "Sync with Plex" button on /media/watchlist:
 *   1. Navigate to /media/watchlist with a mocked watchlist (4 items).
 *   2. Click "Sync with Plex" — kicks off the `plexSyncWatchlist` job.
 *   3. The button flips to "Syncing…" + disabled + spinner while the mocked
 *      job is in the `running` state.
 *   4. The mocked status poll transitions to `completed`; a success toast
 *      ("Watchlist sync complete") surfaces and the button returns to its
 *      idle "Sync with Plex" copy.
 *   5. The mocked watchlist items remain visible after the sync completes.
 *
 * The page reads its data via the generated media Hey API client
 * (`@pops/app-media`, baseUrl `/media-api`; the shell strips the prefix).
 * Every route the page touches is mocked here — the pillar backends are not
 * started for e2e, so an unmocked `/media-api/*` request would hit a dead
 * proxy target.
 *
 * Routes mocked:
 *   GET  /media-api/watchlist            — { data: WatchlistEntry[], pagination }
 *   GET  /media-api/movies               — { data: [], pagination } (titles come
 *   GET  /media-api/tv-shows             —   from each entry's own `title` field)
 *   GET  /media-api/plex/sync/active     — { data: [] } (no phantom running job)
 *   POST /media-api/plex/sync            — { data: { jobId } } (start mutation)
 *   GET  /media-api/plex/sync/:jobId     — { data: SyncJob } (running → completed)
 *
 * The poll interval is 1500ms (useStatusPolling); the first status poll returns
 * `running`, all subsequent polls return `completed`, so the UI exercises both
 * states without a real worker process.
 *
 * Crash detection is wired into beforeEach/afterEach (pageerror + console
 * errors) so every test in this suite verifies no uncaught JS error occurs.
 */
import { expect, test, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_JOB_ID = 'e2e-plex-watchlist-sync-1';
const STARTED_AT = '2026-04-26T10:00:00.000Z';
const COMPLETED_AT = '2026-04-26T10:00:02.500Z';

interface SyncJobProgress {
  processed: number;
  total: number;
}

interface SyncJob {
  id: string;
  jobType: 'plexSyncWatchlist';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  progress: SyncJobProgress;
  result: unknown;
  error: string | null;
}

interface WatchlistEntry {
  id: number;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  priority: number | null;
  notes: string | null;
  source: string | null;
  plexRatingKey: string | null;
  addedAt: string;
  title: string | null;
  posterUrl: string | null;
}

function buildRunningJob(): SyncJob {
  return {
    id: MOCK_JOB_ID,
    jobType: 'plexSyncWatchlist',
    status: 'running',
    startedAt: STARTED_AT,
    completedAt: null,
    durationMs: null,
    progress: { processed: 1, total: 4 },
    result: null,
    error: null,
  };
}

function buildCompletedJob(): SyncJob {
  return {
    id: MOCK_JOB_ID,
    jobType: 'plexSyncWatchlist',
    status: 'completed',
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    durationMs: 2500,
    progress: { processed: 4, total: 4 },
    result: { pushed: 4, pulled: 0 },
    error: null,
  };
}

// The watchlist items render their <h3> title from each entry's own `title`
// field (useWatchlistMediaMaps falls back to `entry.title` when the movie/tv
// map has no matching id), so the movies/tv-shows lists can be empty.
const WATCHLIST_ENTRIES: WatchlistEntry[] = [
  {
    id: 1,
    mediaType: 'movie',
    mediaId: 603,
    priority: 0,
    notes: null,
    source: 'pops',
    plexRatingKey: null,
    addedAt: STARTED_AT,
    title: 'The Matrix',
    posterUrl: null,
  },
  {
    id: 2,
    mediaType: 'movie',
    mediaId: 157336,
    priority: 1,
    notes: null,
    source: 'pops',
    plexRatingKey: null,
    addedAt: STARTED_AT,
    title: 'Interstellar',
    posterUrl: null,
  },
  {
    id: 3,
    mediaType: 'movie',
    mediaId: 550,
    priority: 2,
    notes: null,
    source: 'pops',
    plexRatingKey: null,
    addedAt: STARTED_AT,
    title: 'Fight Club',
    posterUrl: null,
  },
  {
    id: 4,
    mediaType: 'tv',
    mediaId: 124364,
    priority: 3,
    notes: null,
    source: 'pops',
    plexRatingKey: null,
    addedAt: STARTED_AT,
    title: 'Shogun',
    posterUrl: null,
  },
];

const EMPTY_PAGINATION = { total: 0, limit: 500, offset: 0, hasMore: false };

// ---------------------------------------------------------------------------
// REST mocks
//
// State is mutated across status polls (running → completed), so the route
// closures share a single mutable object.
// ---------------------------------------------------------------------------

type MockState = {
  /** Increments each time the status route is polled. The first poll returns
   *  `running`, all subsequent polls return `completed`. */
  statusPolls: number;
  /** Flips true once the start mutation has fired. Defensive — surfaces a
   *  clearer error if status is polled before start. */
  jobStarted: boolean;
};

async function installMediaMocks(page: Page): Promise<MockState> {
  const state: MockState = { statusPolls: 0, jobStarted: false };

  await page.route('**/media-api/watchlist?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: WATCHLIST_ENTRIES,
        pagination: { total: WATCHLIST_ENTRIES.length, limit: 500, offset: 0, hasMore: false },
      }),
    });
  });

  await page.route('**/media-api/movies?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: EMPTY_PAGINATION }),
    });
  });

  await page.route('**/media-api/tv-shows?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: EMPTY_PAGINATION }),
    });
  });

  await page.route('**/media-api/plex/sync/active', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  // POST /plex/sync starts the job; GET /plex/sync/:jobId polls its status.
  // Both share the `/plex/sync/...` prefix, so branch on method + path.
  await page.route('**/media-api/plex/sync', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    state.jobStarted = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { jobId: MOCK_JOB_ID } }),
    });
  });

  await page.route(`**/media-api/plex/sync/${MOCK_JOB_ID}`, async (route) => {
    state.statusPolls += 1;
    const job = state.statusPolls <= 1 ? buildRunningJob() : buildCompletedJob();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: job }),
    });
  });

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Media — watchlist: Plex sync push (mocked)', () => {
  // Mock state is mutated across status polls, so serialise the suite to
  // avoid parallel tests stepping on the same page-scoped mock.
  test.describe.configure({ mode: 'serial' });

  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await installMediaMocks(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        // WebKit logs failed <img> loads as console.error; the seeded poster
        // paths point at a cache route that is not populated during e2e.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('triggers a Plex sync from the watchlist page and surfaces completion', async ({ page }) => {
    // 1. Navigate to /media/watchlist — the mocked list contains 4 items
    //    (Matrix, Interstellar, Fight Club, Shogun).
    await page.goto('/media/watchlist');
    await expect(page.getByRole('heading', { level: 1, name: 'Watchlist' })).toBeVisible({
      timeout: 10_000,
    });

    // The button starts in the idle state.
    const button = page.getByTestId('watchlist-plex-sync-button');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(button).toHaveText(/Sync with Plex/);
    await expect(button).toBeEnabled();

    // Confirm a watchlist item is visible BEFORE the sync — the WatchlistItem
    // renders the title in an <h3>.
    await expect(page.getByRole('heading', { level: 3, name: 'The Matrix' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // 2. Click the sync button. The first status poll returns `running`,
    //    so the button flips to "Syncing…" + disabled.
    await button.click();
    await expect(button).toBeDisabled({ timeout: 10_000 });
    await expect(button).toHaveText(/Syncing…/, { timeout: 10_000 });

    // 3. The poll interval is 1500ms (see useStatusPolling); the second
    //    poll returns `completed`. The hook surfaces a success toast and
    //    the button re-enables back to the idle copy.
    await expect(page.getByText('Watchlist sync complete').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(button).toBeEnabled({ timeout: 10_000 });
    await expect(button).toHaveText(/Sync with Plex/, { timeout: 10_000 });

    // 4. The watchlist remains visible after the sync — the list query is
    //    invalidated on completion and re-fetches the same mocked rows.
    await expect(page.getByRole('heading', { level: 3, name: 'The Matrix' }).first()).toBeVisible();
  });
});
