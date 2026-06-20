/**
 * E2E — Media library: search TMDB and add a movie (#2115)
 *
 * Tier 2 flow covering the add-to-library path that starts from /media:
 *   1. Navigate to /media, follow the header "Search" link to /media/search.
 *   2. Type a query; the mocked TMDB search returns a single, deterministic
 *      movie result that is NOT present in the mocked library.
 *   3. Click "Add to Library" on the result card.
 *   4. Assert the success toast surfaces and the card flips to the
 *      "In Library" badge (optimistic session state on the search page).
 *   5. Navigate back to /media and assert the new movie now appears in the
 *      library grid — the MediaCard link exposes `${title} (Movie)` as its
 *      accessible name.
 *
 * The page reads its data via the generated media Hey API client
 * (`@pops/app-media`, baseUrl `/media-api`; the shell strips the prefix).
 * The pillar backends are not started for e2e, so EVERY route the library
 * and search pages touch is mocked here — an unmocked `/media-api/*` request
 * would hit a dead proxy target and (via the queryFn throw) trip the
 * zero-console-error assertion.
 *
 * Routes mocked:
 *   GET  /media-api/library                    — { data: LibraryItem[], pagination }
 *   GET  /media-api/library/genres             — { data: string[] }
 *   GET  /media-api/arr/config                 — { data: { radarrConfigured:false, sonarrConfigured:false } }
 *   GET  /media-api/rotation/scheduler/leaving — { data: [] }
 *   GET  /media-api/movies                      — { data: [], pagination } (in-library lookup)
 *   GET  /media-api/tv-shows                    — { data: [], pagination } (in-library lookup)
 *   GET  /media-api/search/movies               — bare { results, totalResults, totalPages, page }
 *   GET  /media-api/search/tv-shows             — bare { results }
 *   POST /media-api/library/movies              — { data: Movie, created, message } (add mutation)
 *
 * `arr/config` reports nothing configured so `arr/queue` never fires.
 *
 * Idempotency — the test uses a unique movie title/tmdbId NOT present in the
 * mocked library. No real DB writes occur. No cleanup required.
 *
 * Crash detection is wired into beforeEach/afterEach (pageerror + console
 * errors) so every test in this suite verifies no uncaught JS error occurs.
 */
import { expect, test, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixture — a movie NOT in the mocked library. Inception (tmdbId 27205)
// starts the card in the "Add to Library" state.
// ---------------------------------------------------------------------------
const MOVIE_TMDB_ID = 27205;
const MOVIE_TITLE = 'Inception';
const MOVIE_RELEASE_DATE = '2010-07-16';
const MOVIE_OVERVIEW =
  'Dom Cobb is a skilled thief specialising in the extraction of valuable secrets from deep within the subconscious.';
const MOVIE_POSTER_PATH = '/e2e-inception-poster.jpg';
const MOVIE_BACKDROP_PATH = '/e2e-inception-backdrop.jpg';
const SEARCH_QUERY = 'inception';
/** Local DB id returned by the mocked add. Kept out of the seeded range. */
const LOCAL_MOVIE_ID = 999_001;
const NOW_ISO = '2026-04-24T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Mock payloads
// ---------------------------------------------------------------------------

interface TmdbSearchResult {
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
  originalLanguage: string;
  popularity: number;
}

interface TmdbSearchResponse {
  results: TmdbSearchResult[];
  totalResults: number;
  totalPages: number;
  page: number;
}

interface Movie {
  id: number;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  tagline: string | null;
  releaseDate: string | null;
  runtime: number | null;
  status: string | null;
  originalLanguage: string | null;
  budget: number | null;
  revenue: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  backdropPath: string | null;
  backdropUrl: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  posterOverridePath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  genres: string[];
  createdAt: string;
  updatedAt: string;
  rotationStatus: 'leaving' | 'protected' | null;
  rotationExpiresAt: string | null;
}

interface LibraryListItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  cdnPosterUrl: string | null;
  genres: string[];
  voteAverage: number | null;
  createdAt: string;
  releaseDate: string | null;
}

function buildSearchResult(): TmdbSearchResult {
  return {
    tmdbId: MOVIE_TMDB_ID,
    title: MOVIE_TITLE,
    originalTitle: MOVIE_TITLE,
    overview: MOVIE_OVERVIEW,
    releaseDate: MOVIE_RELEASE_DATE,
    posterPath: MOVIE_POSTER_PATH,
    backdropPath: MOVIE_BACKDROP_PATH,
    voteAverage: 8.4,
    voteCount: 34_000,
    genreIds: [28, 878],
    originalLanguage: 'en',
    popularity: 100,
  };
}

function buildSearchResponse(): TmdbSearchResponse {
  return {
    results: [buildSearchResult()],
    totalResults: 1,
    totalPages: 1,
    page: 1,
  };
}

function buildAddedMovie(): Movie {
  return {
    id: LOCAL_MOVIE_ID,
    tmdbId: MOVIE_TMDB_ID,
    imdbId: 'tt1375666',
    title: MOVIE_TITLE,
    originalTitle: MOVIE_TITLE,
    overview: MOVIE_OVERVIEW,
    tagline: 'Your mind is the scene of the crime.',
    releaseDate: MOVIE_RELEASE_DATE,
    runtime: 148,
    status: 'Released',
    originalLanguage: 'en',
    budget: 160_000_000,
    revenue: 825_500_000,
    posterPath: MOVIE_POSTER_PATH,
    posterUrl: `/media/images/movie/${MOVIE_TMDB_ID}/poster.jpg`,
    backdropPath: MOVIE_BACKDROP_PATH,
    backdropUrl: `/media/images/movie/${MOVIE_TMDB_ID}/backdrop.jpg`,
    logoPath: null,
    logoUrl: null,
    posterOverridePath: null,
    voteAverage: 8.4,
    voteCount: 34_000,
    genres: ['Action', 'Science Fiction'],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    rotationStatus: null,
    rotationExpiresAt: null,
  };
}

function buildLibraryItem(): LibraryListItem {
  return {
    id: LOCAL_MOVIE_ID,
    type: 'movie',
    title: MOVIE_TITLE,
    year: 2010,
    posterUrl: `/media/images/movie/${MOVIE_TMDB_ID}/poster.jpg`,
    cdnPosterUrl: null,
    genres: ['Action', 'Science Fiction'],
    voteAverage: 8.4,
    createdAt: NOW_ISO,
    releaseDate: MOVIE_RELEASE_DATE,
  };
}

const EMPTY_PAGINATION = { total: 0, limit: 1000, offset: 0, hasMore: false };

function buildLibraryListBody(items: LibraryListItem[]) {
  return {
    data: items,
    pagination: {
      page: 1,
      pageSize: 24,
      total: items.length,
      totalPages: items.length > 0 ? 1 : 0,
      hasMore: false,
    },
  };
}

// ---------------------------------------------------------------------------
// REST mocks
// ---------------------------------------------------------------------------

type MockState = {
  /** Flips true after the add mutation fires so library.list includes the new row. */
  movieAdded: boolean;
};

async function installMediaMocks(page: Page): Promise<MockState> {
  const state: MockState = { movieAdded: false };

  // /library and its sub-paths (/library/genres, /library/movies) share a
  // prefix. Playwright matches the most-recently-added route first, so the
  // bare list route is registered FIRST and the more specific sub-paths LAST
  // so they take precedence for their URLs.
  await page.route('**/media-api/library?**', async (route) => {
    const items: LibraryListItem[] = state.movieAdded ? [buildLibraryItem()] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildLibraryListBody(items)),
    });
  });

  await page.route('**/media-api/library/genres', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: ['Action', 'Science Fiction', 'Drama'] }),
    });
  });

  await page.route('**/media-api/library/movies', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    state.movieAdded = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: buildAddedMovie(),
        created: true,
        message: 'Movie added to library',
      }),
    });
  });

  // arr/config reports nothing configured so the polling arr/queue never fires.
  await page.route('**/media-api/arr/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { radarrConfigured: false, sonarrConfigured: false } }),
    });
  });

  await page.route('**/media-api/rotation/scheduler/leaving', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  // In-library lookup lists (search page) and watchlist maps. Empty so the
  // searched movie starts in the "Add to Library" state.
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

  // TMDB search — bare top-level `results` (NOT wrapped in `data`).
  await page.route('**/media-api/search/movies?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildSearchResponse()),
    });
  });

  await page.route('**/media-api/search/tv-shows?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [] }),
    });
  });

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Media — library: search TMDB and add a movie', () => {
  // State is mutated across steps (add → library.list), so serialise the
  // suite to avoid parallel tests stepping on the same page-scoped mock.
  test.describe.configure({ mode: 'serial' });

  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];

    // Register crash detection BEFORE navigation so first-load errors surface.
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
        // WebKit logs failed <img> loads as console.error; the mocked poster
        // paths point at a cache route that is not populated during e2e.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('adds a movie from TMDB search and it surfaces in the library grid', async ({ page }) => {
    // 1. Start on /media — mocked library.list returns an empty collection.
    await page.goto('/media');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible({
      timeout: 10_000,
    });

    // 2. Follow the header "Search" link to /media/search. Scope to the
    //    header region so the search-page input nav link isn't confused with
    //    other "Search" affordances on the page.
    await page.getByRole('link', { name: 'Search', exact: true }).first().click();
    await expect(page).toHaveURL(/\/media\/search/);
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible({
      timeout: 10_000,
    });

    // 3. Type into the TMDB search. SearchInput uses a 300ms debounce; typing
    //    into the native <input> and waiting for the result card is enough —
    //    Playwright auto-waits for the mock response to resolve.
    await page.getByPlaceholder(/Search movies and TV shows/i).fill(SEARCH_QUERY);

    // 4. The mocked TMDB search returns one movie. The result card renders
    //    the title as an <h3>.
    const resultHeading = page.getByRole('heading', { level: 3, name: MOVIE_TITLE });
    await expect(resultHeading).toBeVisible({ timeout: 10_000 });

    // 5. Click "Add to Library" on the result card. Semantic button label.
    //    `.filter({ visible: true })` guards against responsive duplicates.
    const addButton = page
      .getByRole('button', { name: /Add to Library/i })
      .filter({ visible: true })
      .first();
    await expect(addButton).toBeVisible({ timeout: 10_000 });
    await addButton.click();

    // 6. The mocked mutation resolves → the card replaces the Add button
    //    with the "In Library" badge (session-level state). Also a success
    //    toast surfaces via sonner.
    await expect(page.getByText('In Library').filter({ visible: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText('Movie added to library').filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });

    // 7. Navigate back to /media — mocked library.list now returns the new
    //    movie. The MediaCard renders as a Link with aria-label
    //    `${title} (Movie)`, which is a stable semantic hook.
    await page.goto('/media');
    await expect(page.getByRole('link', { name: `${MOVIE_TITLE} (Movie)` }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
