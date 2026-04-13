import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TmdbSearchResult } from '../../tmdb/types.js';

// Hoist mutable state for mock overrides
const mockDismissedIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockWatchedIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockWatchlistIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockLibraryIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockTmdbResults = vi.hoisted(() => ({ value: [] as TmdbSearchResult[] }));

vi.mock('../../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  movies: { id: 'id', tmdbId: 'tmdb_id', title: 'title', genres: 'genres' },
  watchHistory: {
    mediaId: 'media_id',
    mediaType: 'media_type',
    completed: 'completed',
    watchedAt: 'watched_at',
  },
  mediaScores: {
    mediaId: 'media_id',
    mediaType: 'media_type',
    score: 'score',
    dimensionId: 'dimension_id',
  },
  mediaWatchlist: {},
}));

vi.mock('../../tmdb/index.js', () => ({
  getTmdbClient: vi.fn(() => ({
    getMovieRecommendations: vi.fn().mockImplementation(async () => ({
      results: mockTmdbResults.value,
      page: 1,
      totalResults: mockTmdbResults.value.length,
      totalPages: 1,
    })),
  })),
}));

vi.mock('../tmdb-service.js', () => ({
  getLibraryTmdbIds: vi.fn(() => mockLibraryIds.value),
  toDiscoverResults: vi.fn(
    (
      results: TmdbSearchResult[],
      libraryIds: Set<number>,
      watchedIds: Set<number>,
      watchlistIds: Set<number>
    ) =>
      results.map((r) => ({
        tmdbId: r.tmdbId,
        title: r.title,
        overview: r.overview,
        releaseDate: r.releaseDate,
        posterPath: r.posterPath,
        posterUrl: null,
        backdropPath: r.backdropPath,
        voteAverage: r.voteAverage,
        voteCount: r.voteCount,
        genreIds: r.genreIds,
        popularity: r.popularity,
        inLibrary: libraryIds.has(r.tmdbId),
        isWatched: watchedIds.has(r.tmdbId),
        onWatchlist: watchlistIds.has(r.tmdbId),
      }))
  ),
}));

vi.mock('../flags.js', () => ({
  getDismissedTmdbIds: vi.fn(() => mockDismissedIds.value),
  getWatchedTmdbIds: vi.fn(() => mockWatchedIds.value),
  getWatchlistTmdbIds: vi.fn(() => mockWatchlistIds.value),
}));

vi.mock('../service.js', () => ({
  scoreDiscoverResults: vi.fn((results: Record<string, unknown>[]) =>
    results.map((r) => ({
      ...r,
      matchPercentage: 70,
      matchReason: 'Action',
    }))
  ),
}));

vi.mock('./registry.js', () => ({
  registerShelf: vi.fn(),
  getRegisteredShelves: vi.fn(() => []),
}));

import { getDrizzle } from '../../../../db.js';
import { becauseYouWatchedShelf } from './because-you-watched.shelf.js';

const mockGetDrizzle = vi.mocked(getDrizzle);

function makeMockDb(rows: Record<string, unknown>[]) {
  const mockAll = vi.fn().mockReturnValue(rows);
  const mockOrderBy = vi.fn().mockReturnValue({ all: mockAll });
  const mockGroupBy = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
  const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockInnerJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  return { select: vi.fn().mockReturnValue({ from: mockFrom }) } as unknown as ReturnType<
    typeof getDrizzle
  >;
}

function makeSeedRow(
  overrides: Partial<{
    id: number;
    tmdbId: number;
    title: string;
    genres: string;
    avgEloScore: number | null;
    watchedAt: string;
  }> = {}
) {
  return {
    id: 1,
    tmdbId: 100,
    title: 'The Matrix',
    genres: '["Action","Sci-Fi"]',
    avgEloScore: 1650,
    watchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTmdbResult(tmdbId = 200): TmdbSearchResult {
  return {
    tmdbId,
    title: `Movie ${tmdbId}`,
    originalTitle: `Movie ${tmdbId}`,
    overview: 'A film',
    releaseDate: '2024-01-01',
    posterPath: '/poster.jpg',
    backdropPath: null,
    voteAverage: 7.5,
    voteCount: 1000,
    genreIds: [28, 878],
    originalLanguage: 'en',
    popularity: 50,
  };
}

const baseProfile = {
  genreAffinities: [
    { genre: 'Action', avgScore: 1700, movieCount: 5, totalComparisons: 10 },
    { genre: 'Sci-Fi', avgScore: 1600, movieCount: 3, totalComparisons: 6 },
  ],
  dimensionWeights: [],
  genreDistribution: [],
  totalMoviesWatched: 8,
  totalComparisons: 16,
};

beforeEach(() => {
  mockDismissedIds.value = new Set();
  mockWatchedIds.value = new Set();
  mockWatchlistIds.value = new Set();
  mockLibraryIds.value = new Set();
  mockTmdbResults.value = [];
});

describe('becauseYouWatchedShelf — definition', () => {
  it('has id because-you-watched, template true, category seed', () => {
    expect(becauseYouWatchedShelf.id).toBe('because-you-watched');
    expect(becauseYouWatchedShelf.template).toBe(true);
    expect(becauseYouWatchedShelf.category).toBe('seed');
  });
});

describe('becauseYouWatchedShelf — generate()', () => {
  it('returns empty array when no watch history', () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([]));
    const instances = becauseYouWatchedShelf.generate(baseProfile);
    expect(instances).toHaveLength(0);
  });

  it('returns at most 10 instances', () => {
    const seeds = Array.from({ length: 15 }, (_, i) => makeSeedRow({ id: i + 1, tmdbId: 100 + i }));
    mockGetDrizzle.mockReturnValue(makeMockDb(seeds));
    const instances = becauseYouWatchedShelf.generate(baseProfile);
    expect(instances.length).toBeLessThanOrEqual(10);
  });

  it("instance shelfId is 'because-you-watched:<id>'", () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 42 })]));
    const instances = becauseYouWatchedShelf.generate(baseProfile);
    expect(instances[0]!.shelfId).toBe('because-you-watched:42');
  });

  it("instance title is 'Because you watched {Movie}'", () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ title: 'Interstellar' })]));
    const instances = becauseYouWatchedShelf.generate(baseProfile);
    expect(instances[0]!.title).toBe('Because you watched Interstellar');
  });

  it('seedMovieId matches the seed movie id', () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 7 })]));
    const instances = becauseYouWatchedShelf.generate(baseProfile);
    expect(instances[0]!.seedMovieId).toBe(7);
  });

  it('instance score is between 0 and 1', () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow()]));
    const instances = becauseYouWatchedShelf.generate(baseProfile);
    expect(instances[0]!.score).toBeGreaterThan(0);
    expect(instances[0]!.score).toBeLessThanOrEqual(1);
  });

  it('seed rotation: prefers recent watches over older', () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const olderDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const recentSeeds = Array.from({ length: 8 }, (_, i) =>
      makeSeedRow({ id: i + 1, tmdbId: 100 + i, watchedAt: recentDate })
    );
    const olderSeeds = Array.from({ length: 8 }, (_, i) =>
      makeSeedRow({ id: i + 10, tmdbId: 200 + i, watchedAt: olderDate })
    );
    mockGetDrizzle.mockReturnValue(makeMockDb([...recentSeeds, ...olderSeeds]));

    const recentIds = new Set(recentSeeds.map((s) => s.id));
    let totalRecentCount = 0;
    const runs = 10;

    for (let i = 0; i < runs; i++) {
      const instances = becauseYouWatchedShelf.generate(baseProfile);
      totalRecentCount += instances.filter((inst) => recentIds.has(inst.seedMovieId!)).length;
    }

    // Average should be ~6 (60% of 10)
    const avgRecent = totalRecentCount / runs;
    expect(avgRecent).toBeGreaterThanOrEqual(4);
  });
});

describe('becauseYouWatchedShelf — instance.query()', () => {
  it('returns TMDB recommendations', async () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    mockTmdbResults.value = [makeTmdbResult(201), makeTmdbResult(202)];

    const instances = becauseYouWatchedShelf.generate(baseProfile);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results).toHaveLength(2);
    expect(results[0]!.tmdbId).toBe(201);
  });

  it('filters dismissed movies', async () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    mockTmdbResults.value = [makeTmdbResult(201), makeTmdbResult(202), makeTmdbResult(203)];
    mockDismissedIds.value = new Set([202]);

    const instances = becauseYouWatchedShelf.generate(baseProfile);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results.map((r) => r.tmdbId)).not.toContain(202);
    expect(results.map((r) => r.tmdbId)).toContain(201);
    expect(results.map((r) => r.tmdbId)).toContain(203);
  });
});
