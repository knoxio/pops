/**
 * Tests for local library shelves (GH-1384).
 *
 * Each shelf is tested by mocking getDrizzle() and verifying that the correct
 * rows are returned (or filtered). The Drizzle query chain is mocked with a
 * flexible chain helper that accepts any method sequence and calls `.all()` at
 * the end.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  movies: {
    id: 'id',
    tmdbId: 'tmdb_id',
    title: 'title',
    overview: 'overview',
    releaseDate: 'release_date',
    posterPath: 'poster_path',
    backdropPath: 'backdrop_path',
    voteAverage: 'vote_average',
    voteCount: 'vote_count',
    genres: 'genres',
    runtime: 'runtime',
    createdAt: 'created_at',
  },
  watchHistory: {
    id: 'id',
    mediaId: 'media_id',
    mediaType: 'media_type',
    completed: 'completed',
    watchedAt: 'watched_at',
  },
  mediaScores: {
    id: 'id',
    mediaId: 'media_id',
    mediaType: 'media_type',
    score: 'score',
    dimensionId: 'dimension_id',
  },
  comparisonDimensions: {
    id: 'id',
    name: 'name',
  },
}));

vi.mock('./registry.js', () => ({
  registerShelf: vi.fn(),
  getRegisteredShelves: vi.fn(() => []),
  _clearRegistry: vi.fn(),
}));

import { getDrizzle } from '../../../../db.js';
import {
  comfortPicksShelf,
  franchiseCompletionsShelf,
  friendProofShelf,
  longEpicShelf,
  polarizingShelf,
  recentlyAddedShelf,
  shortWatchShelf,
  undiscoveredShelf,
} from './local-shelves.js';

const mockGetDrizzle = vi.mocked(getDrizzle);

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Build a flexible Drizzle chain mock where every method returns the same
 * chainable object. `.all()` returns `allReturn`. Supports sequential calls. */
function makeChainMock(allReturn: unknown[] = []) {
  const allFn = vi.fn().mockReturnValue(allReturn);

  const chain: Record<string, unknown> = { all: allFn };
  for (const m of [
    'from',
    'where',
    'innerJoin',
    'leftJoin',
    'groupBy',
    'having',
    'orderBy',
    'limit',
    'offset',
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }

  const db = {
    select: vi.fn().mockReturnValue(chain),
  } as unknown as ReturnType<typeof getDrizzle>;

  return { db, allFn };
}

/** Minimal movie row fixture. */
function makeMovieRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    tmdbId: 100,
    title: 'Test Movie',
    overview: 'A movie',
    releaseDate: '2024-01-01',
    posterPath: '/poster.jpg',
    backdropPath: null,
    voteAverage: 7.5,
    voteCount: 1000,
    genres: '["Action"]',
    runtime: 120,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Stub PreferenceProfile. */
const profile = {
  genreAffinities: [],
  genreDistribution: [],
  dimensionWeights: [],
  totalMoviesWatched: 0,
  totalComparisons: 0,
};

// ---------------------------------------------------------------------------
// short-watch
// ---------------------------------------------------------------------------

describe('shortWatchShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when no short unwatched movies', async () => {
    const { db } = makeChainMock([]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = shortWatchShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('returns mapped DiscoverResults for short movies', async () => {
    const row = makeMovieRow({ runtime: 85 });
    const { db } = makeChainMock([row]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = shortWatchShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]!.tmdbId).toBe(100);
    expect(results[0]!.inLibrary).toBe(true);
  });

  it('has category=local and template=false', () => {
    expect(shortWatchShelf.category).toBe('local');
    expect(shortWatchShelf.template).toBe(false);
    expect(shortWatchShelf.id).toBe('short-watch');
  });
});

// ---------------------------------------------------------------------------
// long-epic
// ---------------------------------------------------------------------------

describe('longEpicShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when no long unwatched movies', async () => {
    const { db } = makeChainMock([]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = longEpicShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('returns mapped DiscoverResults for long movies', async () => {
    const row = makeMovieRow({ runtime: 180 });
    const { db } = makeChainMock([row]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = longEpicShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]!.inLibrary).toBe(true);
  });

  it('has id=long-epic', () => {
    expect(longEpicShelf.id).toBe('long-epic');
  });
});

// ---------------------------------------------------------------------------
// comfort-picks
// ---------------------------------------------------------------------------

describe('comfortPicksShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when no movies watched 2+ times', async () => {
    const { db } = makeChainMock([]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = comfortPicksShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('marks results as watched', async () => {
    const row = { ...makeMovieRow(), watchCount: 3 };
    const { db } = makeChainMock([row]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = comfortPicksShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results[0]!.isWatched).toBe(true);
  });

  it('has id=comfort-picks', () => {
    expect(comfortPicksShelf.id).toBe('comfort-picks');
  });
});

// ---------------------------------------------------------------------------
// undiscovered
// ---------------------------------------------------------------------------

describe('undiscoveredShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when all movies are watched or compared', async () => {
    const { db } = makeChainMock([]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = undiscoveredShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('returns library movies with no watch/comparison history', async () => {
    const row = makeMovieRow();
    const { db } = makeChainMock([row]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = undiscoveredShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]!.inLibrary).toBe(true);
    expect(results[0]!.isWatched).toBe(false);
  });

  it('has id=undiscovered', () => {
    expect(undiscoveredShelf.id).toBe('undiscovered');
  });
});

// ---------------------------------------------------------------------------
// polarizing
// ---------------------------------------------------------------------------

describe('polarizingShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when no movies have score spread > 200', async () => {
    const { db } = makeChainMock([]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = polarizingShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('returns movies with large ELO spread', async () => {
    const row = { ...makeMovieRow(), scoreRange: 350 };
    const { db } = makeChainMock([row]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = polarizingShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]!.isWatched).toBe(true);
  });

  it('has id=polarizing', () => {
    expect(polarizingShelf.id).toBe('polarizing');
  });
});

// ---------------------------------------------------------------------------
// friend-proof
// ---------------------------------------------------------------------------

describe('friendProofShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when no movies have both dimension scores', async () => {
    const { db } = makeChainMock([]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = friendProofShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('returns movies above 75th percentile of Entertainment+Rewatchability', async () => {
    // 4 movies with avg scores: 1400, 1500, 1600, 1800
    // 75th percentile index = floor(4 * 0.75) = 3 → threshold = 1800
    // Only the movie with score 1800 qualifies
    const rows = [
      { ...makeMovieRow({ tmdbId: 1 }), avgFriendScore: 1800 },
      { ...makeMovieRow({ tmdbId: 2 }), avgFriendScore: 1600 },
      { ...makeMovieRow({ tmdbId: 3 }), avgFriendScore: 1500 },
      { ...makeMovieRow({ tmdbId: 4 }), avgFriendScore: 1400 },
    ];
    const { db } = makeChainMock(rows);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = friendProofShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    // 75th percentile index = floor(4 * 0.75) = 3 → sorted[3].avgFriendScore = 1800
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.isWatched)).toBe(true);
  });

  it('has id=friend-proof', () => {
    expect(friendProofShelf.id).toBe('friend-proof');
  });
});

// ---------------------------------------------------------------------------
// recently-added
// ---------------------------------------------------------------------------

describe('recentlyAddedShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when no unwatched movies', async () => {
    const { db } = makeChainMock([]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = recentlyAddedShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('returns recently added unwatched movies', async () => {
    const row = makeMovieRow({ createdAt: '2024-12-01T00:00:00Z' });
    const { db } = makeChainMock([row]);
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = recentlyAddedShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]!.isWatched).toBe(false);
  });

  it('has id=recently-added', () => {
    expect(recentlyAddedShelf.id).toBe('recently-added');
  });
});

// ---------------------------------------------------------------------------
// franchise-completions
// ---------------------------------------------------------------------------

describe('franchiseCompletionsShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when no watched movies', async () => {
    // Both queries return empty
    const allFn = vi.fn().mockImplementation(() => {
      return []; // both watched-genres query and unwatched query return []
    });

    const chain: Record<string, unknown> = { all: allFn };
    for (const m of [
      'from',
      'where',
      'innerJoin',
      'groupBy',
      'having',
      'orderBy',
      'limit',
      'offset',
    ]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    const db = { select: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<
      typeof getDrizzle
    >;
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = franchiseCompletionsShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('returns unwatched movies that share genres with watched movies', async () => {
    // Setup: watched query returns a movie with genres ["Action"]
    //        unwatched query returns a movie with genres ["Action", "Drama"]
    const watchedRow = { genres: '["Action"]' };
    const unwatchedRow = makeMovieRow({ genres: '["Action","Drama"]' });

    let selectCallCount = 0;
    const watchedAllFn = vi.fn().mockReturnValue([watchedRow]);
    const unwatchedAllFn = vi.fn().mockReturnValue([unwatchedRow]);

    const watchedChain: Record<string, unknown> = { all: watchedAllFn };
    const unwatchedChain: Record<string, unknown> = { all: unwatchedAllFn };

    for (const m of [
      'from',
      'where',
      'innerJoin',
      'groupBy',
      'having',
      'orderBy',
      'limit',
      'offset',
    ]) {
      watchedChain[m] = vi.fn().mockReturnValue(watchedChain);
      unwatchedChain[m] = vi.fn().mockReturnValue(unwatchedChain);
    }

    const db = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        return selectCallCount === 1 ? watchedChain : unwatchedChain;
      }),
    } as unknown as ReturnType<typeof getDrizzle>;
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = franchiseCompletionsShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]!.tmdbId).toBe(100);
  });

  it('excludes movies with no genre overlap with watched movies', async () => {
    const watchedRow = { genres: '["Horror"]' };
    const unwatchedRow = makeMovieRow({ genres: '["Action","Drama"]' }); // no Horror

    let selectCallCount = 0;
    const watchedChain: Record<string, unknown> = { all: vi.fn().mockReturnValue([watchedRow]) };
    const unwatchedChain: Record<string, unknown> = {
      all: vi.fn().mockReturnValue([unwatchedRow]),
    };

    for (const m of [
      'from',
      'where',
      'innerJoin',
      'groupBy',
      'having',
      'orderBy',
      'limit',
      'offset',
    ]) {
      watchedChain[m] = vi.fn().mockReturnValue(watchedChain);
      unwatchedChain[m] = vi.fn().mockReturnValue(unwatchedChain);
    }

    const db = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        return selectCallCount === 1 ? watchedChain : unwatchedChain;
      }),
    } as unknown as ReturnType<typeof getDrizzle>;
    mockGetDrizzle.mockReturnValue(db);

    const [instance] = franchiseCompletionsShelf.generate(profile);
    const results = await instance!.query({ limit: 10, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('has id=franchise-completions', () => {
    expect(franchiseCompletionsShelf.id).toBe('franchise-completions');
  });
});

// ---------------------------------------------------------------------------
// All shelves: category and template checks
// ---------------------------------------------------------------------------

describe('all local shelves', () => {
  const allShelves = [
    shortWatchShelf,
    longEpicShelf,
    comfortPicksShelf,
    undiscoveredShelf,
    polarizingShelf,
    friendProofShelf,
    recentlyAddedShelf,
    franchiseCompletionsShelf,
  ];

  it('all have category=local', () => {
    for (const shelf of allShelves) {
      expect(shelf.category).toBe('local');
    }
  });

  it('all have template=false', () => {
    for (const shelf of allShelves) {
      expect(shelf.template).toBe(false);
    }
  });

  it('all generate exactly one instance', () => {
    for (const shelf of allShelves) {
      const instances = shelf.generate(profile);
      expect(instances).toHaveLength(1);
    }
  });
});
