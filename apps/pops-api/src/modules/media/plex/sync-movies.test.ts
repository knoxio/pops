import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for Plex movie import — batch sync with progress tracking and fallback matching.
 */
import type BetterSqlite3 from 'better-sqlite3';

import type { TmdbClient } from '../tmdb/client.js';
import type { PlexClient } from './client.js';
import type { PlexMediaItem } from './types.js';

// Mock dependencies
vi.mock('../tmdb/index.js', () => ({
  getTmdbClient: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../movies/service.js', () => ({
  getMovieByTmdbId: vi.fn(),
  createMovie: vi.fn(),
}));

vi.mock('../movies/types.js', () => ({
  toMovie: vi.fn((row: unknown) => row),
}));

vi.mock('../watch-history/service.js', () => ({
  logWatch: vi.fn(),
}));

import { getDb } from '../../../db.js';
import { createMovie, getMovieByTmdbId } from '../movies/service.js';
import { getTmdbClient } from '../tmdb/index.js';
import { logWatch } from '../watch-history/service.js';
import { importMoviesFromPlex } from './sync-movies.js';

const mockGetTmdbClient = vi.mocked(getTmdbClient);
const mockGetDb = vi.mocked(getDb);
const mockGetMovieByTmdbId = vi.mocked(getMovieByTmdbId);
const mockCreateMovie = vi.mocked(createMovie);
const mockLogWatch = vi.mocked(logWatch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlexMovie(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: '100',
    type: 'movie',
    title: 'Fight Club',
    originalTitle: 'Fight Club',
    summary: 'An insomniac office worker...',
    tagline: null,
    year: 1999,
    thumbUrl: null,
    artUrl: null,
    durationMs: 8340000,
    addedAt: 1711000000,
    updatedAt: 1711000100,
    lastViewedAt: 1711500000,
    viewCount: 3,
    rating: 8.0,
    audienceRating: 8.8,
    contentRating: 'R',
    externalIds: [
      { source: 'tmdb', id: '550' },
      { source: 'imdb', id: 'tt0137523' },
    ],
    genres: ['Drama', 'Thriller'],
    directors: ['David Fincher'],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
    ...overrides,
  };
}

function makePlexClient(items: PlexMediaItem[]): PlexClient {
  return {
    getAllItems: vi.fn().mockResolvedValue(items),
  } as unknown as PlexClient;
}

function makeTmdbClient(overrides: Partial<TmdbClient> = {}): TmdbClient {
  return {
    searchMovies: vi
      .fn()
      .mockResolvedValue({ results: [], totalResults: 0, totalPages: 0, page: 1 }),
    getMovie: vi.fn().mockResolvedValue({
      tmdbId: 550,
      imdbId: 'tt0137523',
      title: 'Fight Club',
      originalTitle: 'Fight Club',
      overview: 'An insomniac office worker...',
      tagline: 'Mischief. Mayhem. Soap.',
      releaseDate: '1999-10-15',
      runtime: 139,
      status: 'Released',
      originalLanguage: 'en',
      budget: 63000000,
      revenue: 101200000,
      posterPath: '/pB8BM7pdSp6B6Ih7QI4S2t0POoS.jpg',
      backdropPath: '/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg',
      voteAverage: 8.4,
      voteCount: 26000,
      genres: [{ id: 18, name: 'Drama' }],
      productionCompanies: [],
      spokenLanguages: [],
    }),
    ...overrides,
  } as unknown as TmdbClient;
}

/** Set up getDb mock to return a transaction wrapper that executes the callback. */
function setupDbMock(): void {
  mockGetDb.mockReturnValue({
    transaction: vi.fn((fn: () => unknown) => fn),
  } as unknown as BetterSqlite3.Database);
}

/** Set up standard movie creation mocks for a successful sync. */
function setupMovieMocks(movieId: number = 1, title: string = 'Fight Club'): void {
  mockGetMovieByTmdbId.mockReturnValue(null);
  mockCreateMovie.mockReturnValue({ id: movieId, title, tmdbId: 550 } as unknown as ReturnType<
    typeof createMovie
  >);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  setupDbMock();
});

describe('importMoviesFromPlex', () => {
  it('throws when TMDB client is not configured', async () => {
    mockGetTmdbClient.mockImplementation(() => {
      throw new Error('TMDB_API_KEY is not configured');
    });
    const client = makePlexClient([]);

    await expect(importMoviesFromPlex(client, '1')).rejects.toThrow('TMDB_API_KEY');
    expect(client.getAllItems).not.toHaveBeenCalled();
  });

  it('syncs movie using TMDB ID from Plex Guid', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    setupMovieMocks();

    const movie = makePlexMovie();
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockCreateMovie).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 550 }));
    // Should not fall back to search since Guid had TMDB ID
    expect(tmdb.searchMovies).not.toHaveBeenCalled();
  });

  it('logs watch history for watched movies', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    setupMovieMocks(42);

    const movie = makePlexMovie({ viewCount: 3, lastViewedAt: 1711500000 });
    const client = makePlexClient([movie]);

    await importMoviesFromPlex(client, '1');

    expect(mockLogWatch).toHaveBeenCalledWith({
      mediaType: 'movie',
      mediaId: 42,
      watchedAt: expect.any(String),
      completed: 1,
      source: 'plex_sync',
    });
  });

  it('does not log watch history for unwatched movies', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    setupMovieMocks();

    const movie = makePlexMovie({ viewCount: 0, lastViewedAt: null });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.synced).toBe(1);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it('skips movies when TMDB ID cannot be resolved', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const movie = makePlexMovie({
      externalIds: [{ source: 'imdb', id: 'tt0137523' }],
    });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockCreateMovie).not.toHaveBeenCalled();
  });

  it('falls back to TMDB title+year search when no Guid', async () => {
    const tmdb = makeTmdbClient({
      searchMovies: vi.fn().mockResolvedValue({
        results: [{ tmdbId: 550, title: 'Fight Club', releaseDate: '1999-10-15' }],
        totalResults: 1,
        totalPages: 1,
        page: 1,
      }),
    } as unknown as Partial<TmdbClient>);
    mockGetTmdbClient.mockReturnValue(tmdb);
    setupMovieMocks();

    const movie = makePlexMovie({
      externalIds: [{ source: 'imdb', id: 'tt0137523' }],
    });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.synced).toBe(1);
    expect(tmdb.searchMovies).toHaveBeenCalledWith('Fight Club');
    expect(mockCreateMovie).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 550 }));
  });

  it('skips when TMDB search returns no matching title', async () => {
    const tmdb = makeTmdbClient({
      searchMovies: vi.fn().mockResolvedValue({
        results: [{ tmdbId: 999, title: 'Completely Different Movie', releaseDate: '2020-01-01' }],
        totalResults: 1,
        totalPages: 1,
        page: 1,
      }),
    } as unknown as Partial<TmdbClient>);
    mockGetTmdbClient.mockReturnValue(tmdb);

    const movie = makePlexMovie({
      externalIds: [],
    });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('records errors for failed movies without stopping sync', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const goodMovie = makePlexMovie({ ratingKey: '1', title: 'Good Movie' });
    const badMovie = makePlexMovie({ ratingKey: '2', title: 'Bad Movie' });

    // Bad movie: getMovieByTmdbId returns null, getMovie throws
    mockGetMovieByTmdbId.mockReturnValueOnce(null).mockReturnValueOnce(null);
    mockCreateMovie
      .mockImplementationOnce(() => {
        throw new Error('DB constraint error');
      })
      .mockReturnValueOnce({
        id: 2,
        title: 'Good Movie',
        tmdbId: 550,
      } as unknown as ReturnType<typeof createMovie>);

    const client = makePlexClient([badMovie, goodMovie]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.title).toBe('Bad Movie');
    expect(result.errors[0]!.reason).toContain('DB constraint error');
    expect(result.processed).toBe(2);
  });

  it('calls onProgress callback after each item', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    setupMovieMocks();

    const movies = [
      makePlexMovie({ ratingKey: '1', title: 'Movie 1' }),
      makePlexMovie({ ratingKey: '2', title: 'Movie 2' }),
    ];
    const client = makePlexClient(movies);
    const onProgress = vi.fn();

    await importMoviesFromPlex(client, '1', { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    // Progress object is passed by reference, so capture the final state
    const finalProgress = onProgress.mock.calls[1]![0];
    expect(finalProgress.processed).toBe(2);
    expect(finalProgress.synced).toBe(2);
    expect(finalProgress.total).toBe(2);
  });

  it('handles multiple movies in batch', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockGetMovieByTmdbId.mockReturnValue(null);
    mockCreateMovie.mockReturnValue({
      id: 1,
      title: 'Test',
      tmdbId: 100,
    } as unknown as ReturnType<typeof createMovie>);

    const movies = Array.from({ length: 5 }, (_, i) =>
      makePlexMovie({
        ratingKey: String(i + 1),
        title: `Movie ${i + 1}`,
        externalIds: [{ source: 'tmdb', id: String(100 + i) }],
        viewCount: 0,
        lastViewedAt: null,
      })
    );
    const client = makePlexClient(movies);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.total).toBe(5);
    expect(result.processed).toBe(5);
    expect(result.synced).toBe(5);
    expect(result.errors).toHaveLength(0);
    expect(mockCreateMovie).toHaveBeenCalledTimes(5);
  });

  it('handles empty library section', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const client = makePlexClient([]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.total).toBe(0);
    expect(result.processed).toBe(0);
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('ignores duplicate watch history errors', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    setupMovieMocks();
    mockLogWatch.mockImplementation(() => {
      throw new Error('UNIQUE constraint failed');
    });

    const movie = makePlexMovie({ viewCount: 2, lastViewedAt: 1711500000 });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, '1');

    // Should still count as synced despite watch history error
    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('handles non-numeric TMDB ID in Plex Guid gracefully', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const movie = makePlexMovie({
      externalIds: [{ source: 'tmdb', id: 'invalid' }],
    });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, '1');

    // Should fall back to search, which returns empty, so skipped
    expect(result.skipped).toBe(1);
  });

  it('reuses existing movie without calling createMovie', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockGetMovieByTmdbId.mockReturnValue({
      id: 99,
      title: 'Fight Club',
      tmdbId: 550,
    } as unknown as ReturnType<typeof getMovieByTmdbId>);

    const movie = makePlexMovie({ viewCount: 1, lastViewedAt: 1711500000 });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.synced).toBe(1);
    expect(mockCreateMovie).not.toHaveBeenCalled();
    // Should not fetch from TMDB since movie already exists
    expect(tmdb.getMovie).not.toHaveBeenCalled();
    expect(mockLogWatch).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 99 }));
  });

  it('wraps DB writes in a transaction', async () => {
    const mockTransaction = vi.fn((fn: () => unknown) => fn);
    mockGetDb.mockReturnValue({
      transaction: mockTransaction,
    } as unknown as BetterSqlite3.Database);

    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    setupMovieMocks(42);

    const movie = makePlexMovie({ viewCount: 1, lastViewedAt: 1711500000 });
    const client = makePlexClient([movie]);

    await importMoviesFromPlex(client, '1');

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateMovie).toHaveBeenCalled();
    expect(mockLogWatch).toHaveBeenCalled();
  });

  it('single item failure does not affect other items', async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const movie1 = makePlexMovie({
      ratingKey: '1',
      title: 'Movie 1',
      externalIds: [{ source: 'tmdb', id: '100' }],
    });
    const movie2 = makePlexMovie({
      ratingKey: '2',
      title: 'Movie 2',
      externalIds: [{ source: 'tmdb', id: '200' }],
    });
    const movie3 = makePlexMovie({
      ratingKey: '3',
      title: 'Movie 3',
      externalIds: [{ source: 'tmdb', id: '300' }],
    });

    mockGetMovieByTmdbId.mockReturnValue(null);
    mockCreateMovie
      .mockReturnValueOnce({ id: 1, title: 'Movie 1', tmdbId: 100 } as unknown as ReturnType<
        typeof createMovie
      >)
      .mockImplementationOnce(() => {
        throw new Error('Transaction failed for movie 2');
      })
      .mockReturnValueOnce({ id: 3, title: 'Movie 3', tmdbId: 300 } as unknown as ReturnType<
        typeof createMovie
      >);

    const client = makePlexClient([movie1, movie2, movie3]);

    const result = await importMoviesFromPlex(client, '1');

    expect(result.synced).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.title).toBe('Movie 2');
    expect(result.processed).toBe(3);
  });
});
