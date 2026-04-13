/**
 * Watchlist recommendations tests — uses real in-memory SQLite + mocked TMDB client.
 */
import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedMovie, seedWatchlistEntry, setupTestContext } from '../../../shared/test-utils.js';
import type { TmdbClient } from '../tmdb/client.js';
import type { TmdbSearchResponse, TmdbSearchResult } from '../tmdb/types.js';
import { getWatchlistRecommendations } from './tmdb-service.js';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
  vi.restoreAllMocks();
});

/** Build a minimal TMDB search result. */
function makeTmdbResult(overrides: Partial<TmdbSearchResult> = {}): TmdbSearchResult {
  return {
    tmdbId: 999,
    title: 'Similar Movie',
    originalTitle: 'Similar Movie',
    overview: 'A similar movie',
    releaseDate: '2025-01-01',
    posterPath: '/similar.jpg',
    backdropPath: null,
    voteAverage: 7.0,
    voteCount: 100,
    genreIds: [28],
    originalLanguage: 'en',
    popularity: 50,
    ...overrides,
  };
}

/** Build a mock TMDB client. */
function makeMockClient(similarResponses: Map<number, TmdbSearchResponse> = new Map()): TmdbClient {
  return {
    getMovieSimilar: vi.fn(async (tmdbId: number): Promise<TmdbSearchResponse> => {
      return (
        similarResponses.get(tmdbId) ?? {
          results: [],
          totalResults: 0,
          totalPages: 0,
          page: 1,
        }
      );
    }),
  } as unknown as TmdbClient;
}

describe('getWatchlistRecommendations', () => {
  it('returns empty when watchlist is empty', async () => {
    const client = makeMockClient();
    const result = await getWatchlistRecommendations(client);

    expect(result.results).toEqual([]);
    expect(result.sourceMovies).toEqual([]);
  });

  it('fetches similar movies for watchlist items', async () => {
    const movieId = seedMovie(db, { tmdb_id: 100, title: 'Watchlist Movie' });
    seedWatchlistEntry(db, { media_id: movieId, media_type: 'movie' });

    const responses = new Map<number, TmdbSearchResponse>();
    responses.set(100, {
      results: [makeTmdbResult({ tmdbId: 200, title: 'Similar A' })],
      totalResults: 1,
      totalPages: 1,
      page: 1,
    });

    const client = makeMockClient(responses);
    const result = await getWatchlistRecommendations(client);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.title).toBe('Similar A');
    expect(result.sourceMovies).toContain('Watchlist Movie');
  });

  it('deduplicates results across watchlist items', async () => {
    const movie1 = seedMovie(db, { tmdb_id: 100, title: 'Movie A' });
    const movie2 = seedMovie(db, { tmdb_id: 101, title: 'Movie B' });
    seedWatchlistEntry(db, { media_id: movie1, media_type: 'movie' });
    seedWatchlistEntry(db, { media_id: movie2, media_type: 'movie' });

    const sharedResult = makeTmdbResult({ tmdbId: 500, title: 'Shared Similar' });
    const responses = new Map<number, TmdbSearchResponse>();
    responses.set(100, { results: [sharedResult], totalResults: 1, totalPages: 1, page: 1 });
    responses.set(101, { results: [sharedResult], totalResults: 1, totalPages: 1, page: 1 });

    const client = makeMockClient(responses);
    const result = await getWatchlistRecommendations(client);

    expect(result.results).toHaveLength(1);
  });

  it('excludes library movies from results', async () => {
    const watchlistMovie = seedMovie(db, { tmdb_id: 100, title: 'On Watchlist' });
    seedWatchlistEntry(db, { media_id: watchlistMovie, media_type: 'movie' });
    // This movie is already in the library
    seedMovie(db, { tmdb_id: 200, title: 'Already Owned' });

    const responses = new Map<number, TmdbSearchResponse>();
    responses.set(100, {
      results: [
        makeTmdbResult({ tmdbId: 200, title: 'Already Owned' }),
        makeTmdbResult({ tmdbId: 300, title: 'Not Owned' }),
      ],
      totalResults: 2,
      totalPages: 1,
      page: 1,
    });

    const client = makeMockClient(responses);
    const result = await getWatchlistRecommendations(client);

    const titles = result.results.map((r) => r.title);
    expect(titles).not.toContain('Already Owned');
    expect(titles).toContain('Not Owned');
  });

  it('excludes watchlist movies from results', async () => {
    const movie1 = seedMovie(db, { tmdb_id: 100, title: 'Source' });
    const movie2 = seedMovie(db, { tmdb_id: 200, title: 'Also On Watchlist' });
    seedWatchlistEntry(db, { media_id: movie1, media_type: 'movie' });
    seedWatchlistEntry(db, { media_id: movie2, media_type: 'movie' });

    const responses = new Map<number, TmdbSearchResponse>();
    responses.set(100, {
      results: [
        makeTmdbResult({ tmdbId: 200, title: 'Also On Watchlist' }),
        makeTmdbResult({ tmdbId: 300, title: 'New Discovery' }),
      ],
      totalResults: 2,
      totalPages: 1,
      page: 1,
    });
    responses.set(200, { results: [], totalResults: 0, totalPages: 0, page: 1 });

    const client = makeMockClient(responses);
    const result = await getWatchlistRecommendations(client);

    const titles = result.results.map((r) => r.title);
    expect(titles).not.toContain('Also On Watchlist');
    expect(titles).toContain('New Discovery');
  });

  it('excludes dismissed movies from results', async () => {
    const watchlistMovie = seedMovie(db, { tmdb_id: 100, title: 'Source' });
    seedWatchlistEntry(db, { media_id: watchlistMovie, media_type: 'movie' });

    // Dismiss tmdbId 200
    db.prepare('INSERT INTO dismissed_discover (tmdb_id) VALUES (?)').run(200);

    const responses = new Map<number, TmdbSearchResponse>();
    responses.set(100, {
      results: [
        makeTmdbResult({ tmdbId: 200, title: 'Dismissed Movie' }),
        makeTmdbResult({ tmdbId: 300, title: 'Not Dismissed' }),
      ],
      totalResults: 2,
      totalPages: 1,
      page: 1,
    });

    const client = makeMockClient(responses);
    const result = await getWatchlistRecommendations(client);

    const titles = result.results.map((r) => r.title);
    expect(titles).not.toContain('Dismissed Movie');
    expect(titles).toContain('Not Dismissed');
  });

  it('caps at 10 most recent watchlist items', async () => {
    // Create 12 movies + watchlist entries
    for (let i = 0; i < 12; i++) {
      const id = seedMovie(db, { tmdb_id: 1000 + i, title: `Movie ${i}` });
      seedWatchlistEntry(db, { media_id: id, media_type: 'movie' });
    }

    const client = makeMockClient();
    await getWatchlistRecommendations(client);

    // Should only call getMovieSimilar 10 times (capped)
    expect(client.getMovieSimilar).toHaveBeenCalledTimes(10);
  });

  it('returns sourceMovies attribution', async () => {
    const movie1 = seedMovie(db, { tmdb_id: 100, title: 'Inception' });
    const movie2 = seedMovie(db, { tmdb_id: 101, title: 'Interstellar' });
    seedWatchlistEntry(db, { media_id: movie1, media_type: 'movie' });
    seedWatchlistEntry(db, { media_id: movie2, media_type: 'movie' });

    const client = makeMockClient();
    const result = await getWatchlistRecommendations(client);

    expect(result.sourceMovies).toContain('Inception');
    expect(result.sourceMovies).toContain('Interstellar');
  });
});
