import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TmdbClient } from '../tmdb/client.js';
import type { TmdbSearchResponse } from '../tmdb/types.js';

// Mock getActiveCollections to control which collections are active
vi.mock('./context-collections.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./context-collections.js')>();
  return {
    ...original,
    getActiveCollections: vi.fn(),
  };
});

vi.mock('./flags.js', () => ({
  getDismissedTmdbIds: vi.fn().mockReturnValue(new Set()),
  getWatchedTmdbIds: vi.fn().mockReturnValue(new Set()),
  getWatchlistTmdbIds: vi.fn().mockReturnValue(new Set()),
}));

// Mock database access
vi.mock('../../../db.js', () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        all: vi.fn(() => [{ tmdbId: 100 }, { tmdbId: 200 }]),
      })),
    })),
  })),
}));

import { getActiveCollections } from './context-collections.js';
import { getContextPicks } from './context-picks-service.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from './flags.js';

/** Build a mock TMDB search response. */
function makeTmdbResponse(tmdbIds: number[]): TmdbSearchResponse {
  return {
    page: 1,
    totalResults: tmdbIds.length,
    totalPages: 1,
    results: tmdbIds.map((id) => ({
      tmdbId: id,
      title: `Movie ${id}`,
      originalTitle: `Movie ${id}`,
      overview: 'Test movie',
      releaseDate: '2025-06-01',
      posterPath: `/poster${id}.jpg`,
      backdropPath: null,
      voteAverage: 7.5,
      voteCount: 500,
      genreIds: [35],
      originalLanguage: 'en',
      popularity: 50,
    })),
  };
}

function makeMockClient(responses: TmdbSearchResponse[]): TmdbClient {
  let callIndex = 0;
  return {
    discoverMovies: vi.fn(async () => {
      const resp = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;
      return resp;
    }),
  } as unknown as TmdbClient;
}

describe('getContextPicks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns results for each active collection', async () => {
    const mockedGetActive = vi.mocked(getActiveCollections);
    mockedGetActive.mockReturnValue([
      {
        id: 'date-night',
        title: 'Date Night',
        emoji: '💕',
        genreIds: [10749, 35],
        keywordIds: [],
        trigger: () => true,
      },
      {
        id: 'rainy-day',
        title: 'Rainy Day',
        emoji: '🌧️',
        genreIds: [35, 18, 16],
        keywordIds: [],
        trigger: () => true,
      },
    ]);

    const client = makeMockClient([makeTmdbResponse([1, 2, 3]), makeTmdbResponse([4, 5])]);

    const result = await getContextPicks(client);

    expect(result.collections).toHaveLength(2);
    expect(result.collections[0]!.id).toBe('date-night');
    expect(result.collections[0]!.title).toBe('Date Night');
    expect(result.collections[0]!.emoji).toBe('💕');
    expect(result.collections[0]!.results).toHaveLength(3);
    expect(result.collections[1]!.id).toBe('rainy-day');
    expect(result.collections[1]!.results).toHaveLength(2);
  });

  it('excludes library movies from results', async () => {
    const mockedGetActive = vi.mocked(getActiveCollections);
    mockedGetActive.mockReturnValue([
      {
        id: 'test',
        title: 'Test',
        emoji: '🧪',
        genreIds: [18],
        keywordIds: [],
        trigger: () => true,
      },
    ]);

    // tmdbId 100 and 200 are in library (mocked above)
    const client = makeMockClient([makeTmdbResponse([100, 200, 300, 400])]);

    const result = await getContextPicks(client);

    const ids = result.collections[0]!.results.map((r) => r.tmdbId);
    expect(ids).toEqual([300, 400]);
    expect(ids).not.toContain(100);
    expect(ids).not.toContain(200);
  });

  it('excludes dismissed movies from results', async () => {
    vi.mocked(getDismissedTmdbIds).mockReturnValue(new Set([500, 600]));

    const mockedGetActive = vi.mocked(getActiveCollections);
    mockedGetActive.mockReturnValue([
      {
        id: 'test',
        title: 'Test',
        emoji: '🧪',
        genreIds: [18],
        keywordIds: [],
        trigger: () => true,
      },
    ]);

    const client = makeMockClient([makeTmdbResponse([300, 500, 600, 700])]);

    const result = await getContextPicks(client);

    const ids = result.collections[0]!.results.map((r) => r.tmdbId);
    expect(ids).toEqual([300, 700]);
    expect(ids).not.toContain(500);
    expect(ids).not.toContain(600);
  });

  it('passes correct TMDB discover params', async () => {
    const mockedGetActive = vi.mocked(getActiveCollections);
    mockedGetActive.mockReturnValue([
      {
        id: 'halloween',
        title: 'Halloween',
        emoji: '🎃',
        genreIds: [27],
        keywordIds: [3335],
        trigger: () => true,
      },
    ]);

    const client = makeMockClient([makeTmdbResponse([1])]);

    await getContextPicks(client);

    expect(client.discoverMovies).toHaveBeenCalledWith({
      genreIds: [27],
      keywordIds: [3335],
      sortBy: 'vote_average.desc',
      voteCountGte: 100,
      page: 1,
    });
  });

  it('uses per-collection page param for Load More', async () => {
    const mockedGetActive = vi.mocked(getActiveCollections);
    mockedGetActive.mockReturnValue([
      {
        id: 'date-night',
        title: 'Date Night',
        emoji: '💕',
        genreIds: [10749, 35],
        keywordIds: [],
        trigger: () => true,
      },
      {
        id: 'rainy-day',
        title: 'Rainy Day',
        emoji: '🌧️',
        genreIds: [35, 18, 16],
        keywordIds: [],
        trigger: () => true,
      },
    ]);

    const client = makeMockClient([makeTmdbResponse([1]), makeTmdbResponse([2])]);

    await getContextPicks(client, { 'date-night': 3 });

    expect(client.discoverMovies).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }));
    // Second call (rainy-day) defaults to page 1
    expect(client.discoverMovies).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('omits genreIds param when collection has none', async () => {
    const mockedGetActive = vi.mocked(getActiveCollections);
    mockedGetActive.mockReturnValue([
      {
        id: 'christmas',
        title: 'Christmas Movies',
        emoji: '🎄',
        genreIds: [],
        keywordIds: [207317],
        trigger: () => true,
      },
    ]);

    const client = makeMockClient([makeTmdbResponse([1])]);

    await getContextPicks(client);

    expect(client.discoverMovies).toHaveBeenCalledWith({
      genreIds: undefined,
      keywordIds: [207317],
      sortBy: 'vote_average.desc',
      voteCountGte: 100,
      page: 1,
    });
  });

  it('builds correct poster URLs for non-library movies', async () => {
    const mockedGetActive = vi.mocked(getActiveCollections);
    mockedGetActive.mockReturnValue([
      {
        id: 'test',
        title: 'Test',
        emoji: '🧪',
        genreIds: [18],
        keywordIds: [],
        trigger: () => true,
      },
    ]);

    const client = makeMockClient([makeTmdbResponse([999])]);

    const result = await getContextPicks(client);

    expect(result.collections[0]!.results[0]!.posterUrl).toBe(
      'https://image.tmdb.org/t/p/w342/poster999.jpg'
    );
    expect(result.collections[0]!.results[0]!.inLibrary).toBe(false);
  });

  it('sets isWatched=true when tmdbId is in watch history', async () => {
    vi.mocked(getWatchedTmdbIds).mockReturnValue(new Set([10]));

    vi.mocked(getActiveCollections).mockReturnValue([
      {
        id: 'test',
        title: 'Test',
        emoji: '🧪',
        genreIds: [18],
        keywordIds: [],
        trigger: () => true,
      },
    ]);

    const client = makeMockClient([makeTmdbResponse([10, 20])]);
    const result = await getContextPicks(client);

    const results = result.collections[0]!.results;
    expect(results.find((r) => r.tmdbId === 10)!.isWatched).toBe(true);
    expect(results.find((r) => r.tmdbId === 20)!.isWatched).toBe(false);
  });

  it('sets onWatchlist=true when tmdbId is on watchlist', async () => {
    vi.mocked(getWatchlistTmdbIds).mockReturnValue(new Set([20]));

    vi.mocked(getActiveCollections).mockReturnValue([
      {
        id: 'test',
        title: 'Test',
        emoji: '🧪',
        genreIds: [18],
        keywordIds: [],
        trigger: () => true,
      },
    ]);

    const client = makeMockClient([makeTmdbResponse([10, 20])]);
    const result = await getContextPicks(client);

    const results = result.collections[0]!.results;
    expect(results.find((r) => r.tmdbId === 20)!.onWatchlist).toBe(true);
    expect(results.find((r) => r.tmdbId === 10)!.onWatchlist).toBe(false);
  });
});
