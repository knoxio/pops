import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TmdbClient } from '../tmdb/client.js';
import type { TmdbSearchResult } from '../tmdb/types.js';

// Mock dependencies before imports
vi.mock('../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  movies: { tmdbId: 'tmdb_id', id: 'id' },
  mediaWatchlist: { mediaId: 'media_id', mediaType: 'media_type', addedAt: 'added_at' },
}));

vi.mock('./flags.js', () => ({
  getWatchedTmdbIds: vi.fn().mockReturnValue(new Set()),
  getWatchlistTmdbIds: vi.fn().mockReturnValue(new Set()),
  getDismissedTmdbIds: vi.fn().mockReturnValue(new Set()),
}));

import { getDrizzle } from '../../../db.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from './flags.js';
import { getRecommendations } from './tmdb-service.js';

const mockGetDrizzle = vi.mocked(getDrizzle);
const mockGetDismissedTmdbIds = vi.mocked(getDismissedTmdbIds);

/** Build a minimal TmdbSearchResult. */
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

/** Build a mock TmdbClient. */
function makeTmdbClient(recommendations: TmdbSearchResult[][]): TmdbClient {
  let callIdx = 0;
  return {
    getMovieRecommendations: vi.fn().mockImplementation(async () => {
      const results = recommendations[callIdx] ?? [];
      callIdx++;
      return { results, page: 1, totalResults: results.length, totalPages: 1 };
    }),
  } as unknown as TmdbClient;
}

/** Create a mock DB with configurable library IDs and dismissed IDs. */
function createMockDb(libraryTmdbIds: number[] = [], dismissedTmdbIds: number[] = []) {
  // For Drizzle select queries (getLibraryTmdbIds, topMovies)
  const mockAll = vi.fn();
  const mockLimit = vi.fn().mockReturnValue({ all: mockAll });
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit, all: mockAll });
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, all: mockAll });
  const mockFrom = vi
    .fn()
    .mockReturnValue({ where: mockWhere, all: mockAll, orderBy: mockOrderBy });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  // Track calls to return different data for different queries
  let selectCallCount = 0;
  mockAll.mockImplementation(() => {
    const currentCall = selectCallCount++;
    // First select: topMovies query
    if (currentCall === 0) {
      return [{ tmdbId: 555, title: 'Source Movie' }];
    }
    // Second select: getLibraryTmdbIds
    return libraryTmdbIds.map((id) => ({ tmdbId: id }));
  });

  // For raw SQL query (getDismissedTmdbIds)
  const mockDbAll = vi.fn().mockReturnValue(dismissedTmdbIds.map((id) => ({ tmdb_id: id })));

  return {
    select: mockSelect,
    all: mockDbAll,
  } as unknown as ReturnType<typeof getDrizzle>;
}

describe('getRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDismissedTmdbIds.mockReturnValue(new Set());
  });

  it('returns empty when no top movies exist', async () => {
    const mockDb = createMockDb();
    // Override first query (topMovies) to return empty
    const mockAll = vi.fn().mockReturnValue([]);
    const mockLimit = vi.fn().mockReturnValue({ all: mockAll });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (mockDb as ReturnType<typeof getDrizzle> & { select: ReturnType<typeof vi.fn> }).select =
      mockSelect;
    mockGetDrizzle.mockReturnValue(mockDb);

    const client = makeTmdbClient([]);
    const result = await getRecommendations(client, 3);
    expect(result.results).toHaveLength(0);
    expect(result.sourceMovies).toHaveLength(0);
  });

  it('excludes movies already in library', async () => {
    const mockDb = createMockDb([200]); // tmdbId 200 is in library
    mockGetDrizzle.mockReturnValue(mockDb);

    const client = makeTmdbClient([
      [
        makeTmdbResult({ tmdbId: 100, title: 'Not in lib' }),
        makeTmdbResult({ tmdbId: 200, title: 'In library' }),
      ],
    ]);

    const result = await getRecommendations(client, 1);
    expect(result.results.every((r) => r.tmdbId !== 200)).toBe(true);
    expect(result.results.find((r) => r.tmdbId === 100)).toBeTruthy();
  });

  it('excludes dismissed movies', async () => {
    const mockDb = createMockDb();
    mockGetDrizzle.mockReturnValue(mockDb);
    mockGetDismissedTmdbIds.mockReturnValue(new Set([300]));

    const client = makeTmdbClient([
      [
        makeTmdbResult({ tmdbId: 100, title: 'Keep' }),
        makeTmdbResult({ tmdbId: 300, title: 'Dismissed' }),
      ],
    ]);

    const result = await getRecommendations(client, 1);
    expect(result.results.every((r) => r.tmdbId !== 300)).toBe(true);
    expect(result.results.find((r) => r.tmdbId === 100)).toBeTruthy();
  });

  it('deduplicates results by tmdbId across source movies', async () => {
    // Two source movies both recommend tmdbId 100
    const mockDb = createMockDb();
    // Override topMovies to return 2 source movies
    let selectCallCount = 0;
    const mockAll = vi.fn().mockImplementation(() => {
      const current = selectCallCount++;
      if (current === 0)
        return [
          { tmdbId: 555, title: 'Source 1' },
          { tmdbId: 666, title: 'Source 2' },
        ];
      return []; // library IDs
    });
    const mockLimit = vi.fn().mockReturnValue({ all: mockAll });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit, all: mockAll });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, all: mockAll });
    const mockFrom = vi
      .fn()
      .mockReturnValue({ where: mockWhere, all: mockAll, orderBy: mockOrderBy });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (mockDb as ReturnType<typeof getDrizzle> & { select: ReturnType<typeof vi.fn> }).select =
      mockSelect;
    mockGetDrizzle.mockReturnValue(mockDb);

    const client = makeTmdbClient([
      [makeTmdbResult({ tmdbId: 100, title: 'Shared Rec' })],
      [makeTmdbResult({ tmdbId: 100, title: 'Shared Rec Again' })],
    ]);

    const result = await getRecommendations(client, 2);
    const tmdbIds = result.results.map((r) => r.tmdbId);
    expect(tmdbIds.filter((id) => id === 100)).toHaveLength(1);
  });

  it('returns sourceMovies array', async () => {
    const mockDb = createMockDb();
    mockGetDrizzle.mockReturnValue(mockDb);

    const client = makeTmdbClient([[makeTmdbResult({ tmdbId: 100 })]]);
    const result = await getRecommendations(client, 1);
    expect(result.sourceMovies).toEqual(['Source Movie']);
  });

  it('marks all results as not in library', async () => {
    const mockDb = createMockDb();
    mockGetDrizzle.mockReturnValue(mockDb);

    const client = makeTmdbClient([[makeTmdbResult({ tmdbId: 100 })]]);
    const result = await getRecommendations(client, 1);
    expect(result.results.every((r) => !r.inLibrary)).toBe(true);
  });

  it('sets isWatched=true when tmdbId is in watch history', async () => {
    vi.mocked(getWatchedTmdbIds).mockReturnValue(new Set([100]));
    const mockDb = createMockDb();
    mockGetDrizzle.mockReturnValue(mockDb);

    const client = makeTmdbClient([
      [makeTmdbResult({ tmdbId: 100 }), makeTmdbResult({ tmdbId: 400 })],
    ]);
    const result = await getRecommendations(client, 1);

    expect(result.results.find((r) => r.tmdbId === 100)!.isWatched).toBe(true);
    expect(result.results.find((r) => r.tmdbId === 400)!.isWatched).toBe(false);
  });

  it('sets onWatchlist=true when tmdbId is on watchlist', async () => {
    vi.mocked(getWatchlistTmdbIds).mockReturnValue(new Set([400]));
    const mockDb = createMockDb();
    mockGetDrizzle.mockReturnValue(mockDb);

    const client = makeTmdbClient([
      [makeTmdbResult({ tmdbId: 100 }), makeTmdbResult({ tmdbId: 400 })],
    ]);
    const result = await getRecommendations(client, 1);

    expect(result.results.find((r) => r.tmdbId === 400)!.onWatchlist).toBe(true);
    expect(result.results.find((r) => r.tmdbId === 100)!.onWatchlist).toBe(false);
  });
});
