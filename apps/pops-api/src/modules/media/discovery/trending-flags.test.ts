/**
 * Tests for isWatched + onWatchlist flags on discover results from getTrending.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TmdbClient } from '../tmdb/client.js';
import type { TmdbSearchResult } from '../tmdb/types.js';

// Mock flags module so we can control watched/watchlist/dismissed sets independently
vi.mock('./flags.js', () => ({
  getWatchedTmdbIds: vi.fn(),
  getWatchlistTmdbIds: vi.fn(),
  getDismissedTmdbIds: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  movies: { tmdbId: 'tmdb_id' },
}));

vi.mock('./service.js', () => ({
  getPreferenceProfile: vi.fn(),
  scoreDiscoverResults: vi.fn(<T>(results: T) => results),
}));

import { getDrizzle } from '../../../db.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from './flags.js';
import { getTrending } from './tmdb-service.js';

const mockGetDrizzle = vi.mocked(getDrizzle);
const mockGetWatchedTmdbIds = vi.mocked(getWatchedTmdbIds);
const mockGetWatchlistTmdbIds = vi.mocked(getWatchlistTmdbIds);
const mockGetDismissedTmdbIds = vi.mocked(getDismissedTmdbIds);

function makeTmdbResult(overrides: Partial<TmdbSearchResult> = {}): TmdbSearchResult {
  return {
    tmdbId: 100,
    title: 'Test Movie',
    originalTitle: 'Test Movie',
    overview: 'A test',
    releaseDate: '2025-01-01',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    voteAverage: 7.5,
    voteCount: 1000,
    genreIds: [28],
    originalLanguage: 'en',
    popularity: 50,
    ...overrides,
  };
}

function makeTmdbClient(results: TmdbSearchResult[]): TmdbClient {
  return {
    getTrendingMovies: vi.fn().mockResolvedValue({
      results,
      page: 1,
      totalResults: results.length,
      totalPages: 1,
    }),
  } as unknown as TmdbClient;
}

/** Create a mock DB that returns given libraryIds and no dismissed IDs. */
function createMockDb(libraryTmdbIds: number[] = []) {
  const mockAll = vi.fn().mockReturnValue(libraryTmdbIds.map((id) => ({ tmdbId: id })));
  const mockFrom = vi.fn().mockReturnValue({ all: mockAll });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  // Raw SQL query for dismissed_discover
  const mockDbAll = vi.fn().mockReturnValue([]);
  return { select: mockSelect, all: mockDbAll } as unknown as ReturnType<typeof getDrizzle>;
}

describe('getTrending — isWatched + onWatchlist flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDismissedTmdbIds.mockReturnValue(new Set());
  });

  it('sets isWatched=false and onWatchlist=false for a plain result', async () => {
    mockGetDrizzle.mockReturnValue(createMockDb());
    mockGetWatchedTmdbIds.mockReturnValue(new Set());
    mockGetWatchlistTmdbIds.mockReturnValue(new Set());

    const client = makeTmdbClient([makeTmdbResult({ tmdbId: 100 })]);
    const { results } = await getTrending(client, 'week', 1);

    expect(results).toHaveLength(1);
    expect(results[0]!.isWatched).toBe(false);
    expect(results[0]!.onWatchlist).toBe(false);
  });

  it('sets isWatched=true when tmdbId is in watch history', async () => {
    mockGetDrizzle.mockReturnValue(createMockDb());
    mockGetWatchedTmdbIds.mockReturnValue(new Set([100]));
    mockGetWatchlistTmdbIds.mockReturnValue(new Set());

    const client = makeTmdbClient([
      makeTmdbResult({ tmdbId: 100, title: 'Watched Movie' }),
      makeTmdbResult({ tmdbId: 200, title: 'Unwatched Movie' }),
    ]);
    const { results } = await getTrending(client, 'week', 1);

    const watched = results.find((r) => r.tmdbId === 100);
    const unwatched = results.find((r) => r.tmdbId === 200);
    expect(watched!.isWatched).toBe(true);
    expect(unwatched!.isWatched).toBe(false);
  });

  it('sets onWatchlist=true when tmdbId is on watchlist', async () => {
    mockGetDrizzle.mockReturnValue(createMockDb());
    mockGetWatchedTmdbIds.mockReturnValue(new Set());
    mockGetWatchlistTmdbIds.mockReturnValue(new Set([200]));

    const client = makeTmdbClient([
      makeTmdbResult({ tmdbId: 100, title: 'Not on watchlist' }),
      makeTmdbResult({ tmdbId: 200, title: 'On watchlist' }),
    ]);
    const { results } = await getTrending(client, 'week', 1);

    const onWatchlist = results.find((r) => r.tmdbId === 200);
    const notOnWatchlist = results.find((r) => r.tmdbId === 100);
    expect(onWatchlist!.onWatchlist).toBe(true);
    expect(notOnWatchlist!.onWatchlist).toBe(false);
  });

  it('can set both isWatched=true and onWatchlist=true simultaneously', async () => {
    mockGetDrizzle.mockReturnValue(createMockDb());
    mockGetWatchedTmdbIds.mockReturnValue(new Set([100]));
    mockGetWatchlistTmdbIds.mockReturnValue(new Set([100]));

    const client = makeTmdbClient([makeTmdbResult({ tmdbId: 100 })]);
    const { results } = await getTrending(client, 'week', 1);

    expect(results[0]!.isWatched).toBe(true);
    expect(results[0]!.onWatchlist).toBe(true);
  });

  it('also sets inLibrary=true when tmdbId is in library', async () => {
    mockGetDrizzle.mockReturnValue(createMockDb([100])); // 100 in library
    mockGetWatchedTmdbIds.mockReturnValue(new Set([100]));
    mockGetWatchlistTmdbIds.mockReturnValue(new Set());

    const client = makeTmdbClient([makeTmdbResult({ tmdbId: 100 })]);
    const { results } = await getTrending(client, 'week', 1);

    expect(results[0]!.inLibrary).toBe(true);
    expect(results[0]!.isWatched).toBe(true);
  });
});
