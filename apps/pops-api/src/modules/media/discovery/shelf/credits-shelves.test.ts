import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TmdbMovieCredits, TmdbSearchResult } from '../../tmdb/types.js';

// Hoist mutable state for mock overrides
const mockDismissedIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockWatchedIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockWatchlistIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockLibraryIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockTmdbResults = vi.hoisted(() => ({ value: [] as TmdbSearchResult[] }));
const mockCredits = vi.hoisted(() => ({
  value: {
    id: 100,
    crew: [{ id: 501, name: 'Christopher Nolan', job: 'Director', department: 'Directing' }],
    cast: [
      { id: 601, name: 'Leonardo DiCaprio', order: 0 },
      { id: 602, name: 'Tom Hardy', order: 1 },
      { id: 603, name: 'Cillian Murphy', order: 2 },
      { id: 604, name: 'Ken Watanabe', order: 3 },
    ],
  } as TmdbMovieCredits,
}));

vi.mock('../../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  movies: { id: 'id', tmdbId: 'tmdb_id', title: 'title' },
  mediaScores: {
    mediaId: 'media_id',
    mediaType: 'media_type',
    score: 'score',
  },
}));

vi.mock('../../tmdb/index.js', () => ({
  getTmdbClient: vi.fn(() => ({
    getMovieCredits: vi.fn().mockImplementation(async () => mockCredits.value),
    discoverMoviesByCrew: vi.fn().mockImplementation(async () => ({
      results: mockTmdbResults.value,
      page: 1,
      totalResults: mockTmdbResults.value.length,
      totalPages: 1,
    })),
    discoverMoviesByCast: vi.fn().mockImplementation(async () => ({
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
      matchReason: 'Genre',
    }))
  ),
}));

vi.mock('./registry.js', () => ({
  registerShelf: vi.fn(),
  getRegisteredShelves: vi.fn(() => []),
}));

import { getDrizzle } from '../../../../db.js';
import { _creditsCache, moreFromActorShelf, moreFromDirectorShelf } from './credits-shelves.js';

const mockGetDrizzle = vi.mocked(getDrizzle);

function makeMockDb(rows: Record<string, unknown>[]) {
  const mockAll = vi.fn().mockReturnValue(rows);
  const mockGroupBy = vi.fn().mockReturnValue({ all: mockAll });
  const mockLeftJoin = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
  const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
  return { select: vi.fn().mockReturnValue({ from: mockFrom }) } as unknown as ReturnType<
    typeof getDrizzle
  >;
}

function makeSeedRow(
  overrides: Partial<{
    id: number;
    tmdbId: number;
    title: string;
    avgEloScore: number | null;
  }> = {}
) {
  return {
    id: 1,
    tmdbId: 100,
    title: 'Inception',
    avgEloScore: 1700,
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
  genreAffinities: [{ genre: 'Action', avgScore: 1700, movieCount: 5, totalComparisons: 10 }],
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
  _creditsCache.clear();
});

describe('moreFromDirectorShelf — definition', () => {
  it('has id more-from-director, template true, category seed', () => {
    expect(moreFromDirectorShelf.id).toBe('more-from-director');
    expect(moreFromDirectorShelf.template).toBe(true);
    expect(moreFromDirectorShelf.category).toBe('seed');
  });
});

describe('moreFromActorShelf — definition', () => {
  it('has id more-from-actor, template true, category seed', () => {
    expect(moreFromActorShelf.id).toBe('more-from-actor');
    expect(moreFromActorShelf.template).toBe(true);
    expect(moreFromActorShelf.category).toBe('seed');
  });
});

describe('seed selection — above-median ELO', () => {
  it('returns empty when no movies in DB', () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([]));
    const instances = moreFromDirectorShelf.generate(baseProfile);
    expect(instances).toHaveLength(0);
  });

  it('filters to above-median ELO seeds', () => {
    const rows = [
      makeSeedRow({ id: 1, tmdbId: 101, avgEloScore: 1800 }),
      makeSeedRow({ id: 2, tmdbId: 102, avgEloScore: 1600 }),
      makeSeedRow({ id: 3, tmdbId: 103, avgEloScore: 1400 }),
      makeSeedRow({ id: 4, tmdbId: 104, avgEloScore: 1200 }),
    ];
    mockGetDrizzle.mockReturnValue(makeMockDb(rows));
    const instances = moreFromDirectorShelf.generate(baseProfile);
    // Median is ~1500 (between 1400 and 1600), so above-median = 1600, 1800
    expect(instances.length).toBeGreaterThanOrEqual(1);
    expect(instances.length).toBeLessThanOrEqual(2);
  });

  it('caps at 10 seeds', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeSeedRow({ id: i + 1, tmdbId: 100 + i, avgEloScore: 1700 + i })
    );
    mockGetDrizzle.mockReturnValue(makeMockDb(rows));
    const instances = moreFromDirectorShelf.generate(baseProfile);
    expect(instances.length).toBeLessThanOrEqual(10);
  });
});

describe('moreFromDirectorShelf — generate()', () => {
  it("shelfId is 'more-from-director:{seedId}'", () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 42 })]));
    const instances = moreFromDirectorShelf.generate(baseProfile);
    expect(instances[0]!.shelfId).toBe('more-from-director:42');
  });

  it('title uses cached director name when available', () => {
    _creditsCache.set(100, mockCredits.value);
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    const instances = moreFromDirectorShelf.generate(baseProfile);
    expect(instances[0]!.title).toBe('More from Christopher Nolan');
  });

  it('title falls back to movie name when cache miss', () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([makeSeedRow({ id: 1, tmdbId: 100, title: 'Inception' })])
    );
    const instances = moreFromDirectorShelf.generate(baseProfile);
    expect(instances[0]!.title).toBe('More from the director of Inception');
  });

  it('instance score is between 0 and 1', () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow()]));
    const instances = moreFromDirectorShelf.generate(baseProfile);
    expect(instances[0]!.score).toBeGreaterThan(0);
    expect(instances[0]!.score).toBeLessThanOrEqual(1);
  });

  it('seedMovieId matches the seed movie id', () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 7 })]));
    const instances = moreFromDirectorShelf.generate(baseProfile);
    expect(instances[0]!.seedMovieId).toBe(7);
  });
});

describe('moreFromActorShelf — generate()', () => {
  it('produces up to 3 instances per seed movie (one per lead actor position)', () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    const instances = moreFromActorShelf.generate(baseProfile);
    expect(instances).toHaveLength(3);
  });

  it("shelfIds are 'more-from-actor:{seedId}:{actorIndex}'", () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 5, tmdbId: 100 })]));
    const instances = moreFromActorShelf.generate(baseProfile);
    expect(instances[0]!.shelfId).toBe('more-from-actor:5:0');
    expect(instances[1]!.shelfId).toBe('more-from-actor:5:1');
    expect(instances[2]!.shelfId).toBe('more-from-actor:5:2');
  });

  it('title uses cached actor name when available', () => {
    _creditsCache.set(100, mockCredits.value);
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    const instances = moreFromActorShelf.generate(baseProfile);
    expect(instances[0]!.title).toBe('More from Leonardo DiCaprio');
    expect(instances[1]!.title).toBe('More from Tom Hardy');
    expect(instances[2]!.title).toBe('More from Cillian Murphy');
  });
});

describe('moreFromDirectorShelf — instance.query()', () => {
  it('fetches credits, extracts director, returns discover results', async () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    mockTmdbResults.value = [makeTmdbResult(201), makeTmdbResult(202)];

    const instances = moreFromDirectorShelf.generate(baseProfile);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results).toHaveLength(2);
    expect(results[0]!.tmdbId).toBe(201);
  });

  it('returns empty array when no director in credits', async () => {
    _creditsCache.set(100, { id: 100, crew: [], cast: [] });
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));

    const instances = moreFromDirectorShelf.generate(baseProfile);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results).toHaveLength(0);
  });

  it('filters dismissed movies', async () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    mockTmdbResults.value = [makeTmdbResult(201), makeTmdbResult(202), makeTmdbResult(203)];
    mockDismissedIds.value = new Set([202]);

    const instances = moreFromDirectorShelf.generate(baseProfile);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results.map((r) => r.tmdbId)).not.toContain(202);
    expect(results.map((r) => r.tmdbId)).toContain(201);
    expect(results.map((r) => r.tmdbId)).toContain(203);
  });

  it('caches credits after first fetch', async () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    mockTmdbResults.value = [makeTmdbResult(201)];

    const instances = moreFromDirectorShelf.generate(baseProfile);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(_creditsCache.has(100)).toBe(true);
    expect(_creditsCache.get(100)).toBe(mockCredits.value);
  });
});

describe('moreFromActorShelf — instance.query()', () => {
  it('returns empty when actor index out of range', async () => {
    _creditsCache.set(100, {
      id: 100,
      crew: [],
      cast: [
        { id: 601, name: 'Actor A', order: 0 },
        // Only 1 lead actor — index 1 and 2 are out of range
      ],
    });
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    mockTmdbResults.value = [makeTmdbResult(201)];

    const instances = moreFromActorShelf.generate(baseProfile);
    const results = await instances[1]!.query({ limit: 10, offset: 0 }); // index 1 — no actor

    expect(results).toHaveLength(0);
  });

  it('returns discover results for lead actor', async () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([makeSeedRow({ id: 1, tmdbId: 100 })]));
    mockTmdbResults.value = [makeTmdbResult(201), makeTmdbResult(202)];

    const instances = moreFromActorShelf.generate(baseProfile);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results).toHaveLength(2);
  });
});
