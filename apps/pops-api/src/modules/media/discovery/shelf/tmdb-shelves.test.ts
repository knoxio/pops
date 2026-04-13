import { describe, expect, it, vi } from 'vitest';

import type { TmdbSearchResponse } from '../../tmdb/types.js';
import type { PreferenceProfile } from '../types.js';

// Mock dependencies before imports
vi.mock('../../../../db.js', () => ({ getDrizzle: vi.fn() }));
vi.mock('@pops/db-types', () => ({
  watchHistory: { mediaType: 'media_type', completed: 'completed', watchedAt: 'watched_at' },
  movies: { id: 'id', releaseDate: 'release_date' },
}));
vi.mock('../../tmdb/index.js', () => ({ getTmdbClient: vi.fn() }));
vi.mock('../tmdb-service.js', () => ({
  getLibraryTmdbIds: vi.fn().mockReturnValue(new Set()),
  toDiscoverResults: vi.fn().mockReturnValue([]),
}));
vi.mock('../flags.js', () => ({
  getDismissedTmdbIds: vi.fn().mockReturnValue(new Set()),
  getWatchedTmdbIds: vi.fn().mockReturnValue(new Set()),
  getWatchlistTmdbIds: vi.fn().mockReturnValue(new Set()),
}));
vi.mock('../service.js', () => ({
  scoreDiscoverResults: vi.fn().mockReturnValue([]),
}));
vi.mock('./registry.js', () => ({ registerShelf: vi.fn() }));

// Import the module under test — registers shelves as a side effect
import './tmdb-shelves.js';

import { getDrizzle } from '../../../../db.js';
import { getTmdbClient } from '../../tmdb/index.js';
import { registerShelf } from './registry.js';

const mockGetDrizzle = vi.mocked(getDrizzle);
const mockGetTmdbClient = vi.mocked(getTmdbClient);
const mockRegisterShelf = vi.mocked(registerShelf);

const profile: PreferenceProfile = {
  genreAffinities: [
    { genre: 'Drama', avgScore: 8.5, movieCount: 20, totalComparisons: 40 },
    { genre: 'Action', avgScore: 7.0, movieCount: 15, totalComparisons: 30 },
    { genre: 'Thriller', avgScore: 6.5, movieCount: 10, totalComparisons: 20 },
  ],
  dimensionWeights: [],
  genreDistribution: [],
  totalMoviesWatched: 50,
  totalComparisons: 100,
};

const emptyProfile: PreferenceProfile = {
  genreAffinities: [],
  dimensionWeights: [],
  genreDistribution: [],
  totalMoviesWatched: 5,
  totalComparisons: 10,
};

/** Empty TMDB response. */
const emptyResponse: TmdbSearchResponse = {
  page: 1,
  totalResults: 0,
  totalPages: 0,
  results: [],
};

/** Build a mock TmdbClient. */
function makeMockClient() {
  return {
    discoverMovies: vi.fn().mockResolvedValue(emptyResponse),
  } as unknown as ReturnType<typeof getTmdbClient>;
}

function mockDecade(decade: number) {
  const mockAll = vi.fn().mockReturnValue([{ decade, watchCount: 5 }]);
  const mockLimit = vi.fn().mockReturnValue({ all: mockAll });
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockGroupBy = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  mockGetDrizzle.mockReturnValue({ select: mockSelect } as unknown as ReturnType<
    typeof getDrizzle
  >);
}

describe('tmdb-shelves registration', () => {
  it('registers all 5 shelves at module load', () => {
    expect(mockRegisterShelf).toHaveBeenCalledTimes(5);
    const ids = mockRegisterShelf.mock.calls.map((c) => c[0]?.id);
    expect(ids).toContain('new-releases');
    expect(ids).toContain('hidden-gems');
    expect(ids).toContain('critics-vs-audiences');
    expect(ids).toContain('award-winners');
    expect(ids).toContain('decade-picks');
  });

  it('all shelves are category=tmdb and template=false', () => {
    for (const [def] of mockRegisterShelf.mock.calls) {
      expect(def?.category).toBe('tmdb');
      expect(def?.template).toBe(false);
    }
  });
});

describe('new-releases shelf', () => {
  it('generate() returns 1 instance with shelfId=new-releases', () => {
    mockDecade(1990);
    const [newReleasesCall] = mockRegisterShelf.mock.calls.filter(
      (c) => c[0]?.id === 'new-releases'
    );
    const def = newReleasesCall?.[0];
    expect(def).toBeDefined();
    const instances = def!.generate(profile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe('new-releases');
  });

  it('query() calls discoverMovies with releaseDateGte and genre IDs', async () => {
    mockDecade(1990);
    const client = makeMockClient();
    mockGetTmdbClient.mockReturnValue(client);

    const [newReleasesCall] = mockRegisterShelf.mock.calls.filter(
      (c) => c[0]?.id === 'new-releases'
    );
    const def = newReleasesCall?.[0];
    const instances = def!.generate(profile);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(client.discoverMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseDateGte: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        genreIds: expect.arrayContaining([18, 28, 53]), // Drama, Action, Thriller
      })
    );
  });

  it('query() calls discoverMovies without genreIds when profile has none', async () => {
    mockDecade(1990);
    const client = makeMockClient();
    mockGetTmdbClient.mockReturnValue(client);

    const [newReleasesCall] = mockRegisterShelf.mock.calls.filter(
      (c) => c[0]?.id === 'new-releases'
    );
    const def = newReleasesCall?.[0];
    const instances = def!.generate(emptyProfile);
    await instances[0]!.query({ limit: 10, offset: 0 });

    const callArg = vi.mocked(client.discoverMovies).mock.calls[0]?.[0];
    expect(callArg?.genreIds).toBeUndefined();
  });
});

describe('hidden-gems shelf', () => {
  it('generate() returns 1 instance with shelfId=hidden-gems', () => {
    mockDecade(1990);
    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'hidden-gems');
    const instances = call![0].generate(profile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe('hidden-gems');
  });

  it('query() calls discoverMovies with vote count bounds and voteAverageGte', async () => {
    mockDecade(1990);
    const client = makeMockClient();
    mockGetTmdbClient.mockReturnValue(client);

    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'hidden-gems');
    const instances = call![0].generate(profile);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(client.discoverMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        voteCountGte: 50,
        voteCountLte: 500,
        voteAverageGte: 7.0,
      })
    );
  });
});

describe('critics-vs-audiences shelf', () => {
  it('generate() returns 1 instance with shelfId=critics-vs-audiences', () => {
    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'critics-vs-audiences');
    const instances = call![0].generate(profile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe('critics-vs-audiences');
  });

  it('query() calls discoverMovies with voteAverageGte=8.0 and popularity.asc sort', async () => {
    const client = makeMockClient();
    mockGetTmdbClient.mockReturnValue(client);

    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'critics-vs-audiences');
    const instances = call![0].generate(profile);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(client.discoverMovies).toHaveBeenCalledWith(
      expect.objectContaining({ voteAverageGte: 8.0, sortBy: 'popularity.asc' })
    );
  });
});

describe('award-winners shelf', () => {
  it('generate() returns 1 instance with shelfId=award-winners', () => {
    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'award-winners');
    const instances = call![0].generate(profile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe('award-winners');
  });

  it('query() calls discoverMovies with academy-award and golden-globe keyword IDs', async () => {
    const client = makeMockClient();
    mockGetTmdbClient.mockReturnValue(client);

    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'award-winners');
    const instances = call![0].generate(profile);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(client.discoverMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordIds: expect.arrayContaining([154712, 156299]),
      })
    );
  });
});

describe('decade-picks shelf', () => {
  it('generate() returns 1 instance with shelfId=decade-picks', () => {
    mockDecade(1990);
    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'decade-picks');
    const instances = call![0].generate(profile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe('decade-picks');
  });

  it('generate() title uses the most-watched decade', () => {
    mockDecade(1980);
    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'decade-picks');
    const instances = call![0].generate(profile);
    expect(instances[0]!.title).toContain('1980');
  });

  it('query() calls discoverMovies with decade date range', async () => {
    mockDecade(1990);
    const client = makeMockClient();
    mockGetTmdbClient.mockReturnValue(client);

    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'decade-picks');
    const instances = call![0].generate(profile);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(client.discoverMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseDateGte: '1990-01-01',
        releaseDateLte: '1999-12-31',
      })
    );
  });

  it('falls back to 1990s when no watch history exists', () => {
    const mockAll = vi.fn().mockReturnValue([]);
    const mockLimit = vi.fn().mockReturnValue({ all: mockAll });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockGroupBy = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    mockGetDrizzle.mockReturnValue({
      select: mockSelect,
    } as unknown as ReturnType<typeof getDrizzle>);

    const [call] = mockRegisterShelf.mock.calls.filter((c) => c[0]?.id === 'decade-picks');
    const instances = call![0].generate(profile);
    expect(instances[0]!.title).toContain('1990');
  });
});
