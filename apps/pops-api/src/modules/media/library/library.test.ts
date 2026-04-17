import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCaller, seedMovie, setupTestContext } from '../../../shared/test-utils.js';
import { TmdbApiError } from '../tmdb/types.js';

import type { Database } from 'better-sqlite3';

import type { TmdbMovieDetail } from '../tmdb/types.js';

// Mock the TMDB client module
vi.mock('../tmdb/client.js', () => ({
  TmdbClient: vi.fn(),
}));

// Shared mock image cache instance — stable reference across tests
const mockImageCache = {
  downloadMovieImages: vi.fn().mockResolvedValue(undefined),
  deleteMovieImages: vi.fn().mockResolvedValue(undefined),
  getImagePath: vi.fn().mockResolvedValue(null),
};

vi.mock('../tmdb/image-cache.js', () => ({
  ImageCacheService: vi.fn().mockImplementation(function () {
    return mockImageCache;
  }),
  MEDIA_DIR_NAMES: { movie: 'movies', tv: 'tv' },
}));

// Set the env var before the router module loads
vi.stubEnv('TMDB_API_KEY', 'test-api-key');

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

const MOCK_TMDB_DETAIL: TmdbMovieDetail = {
  tmdbId: 550,
  imdbId: 'tt0137523',
  title: 'Fight Club',
  originalTitle: 'Fight Club',
  overview:
    'An insomniac office worker and a devil-may-care soap maker form an underground fight club.',
  tagline: 'Mischief. Mayhem. Soap.',
  releaseDate: '1999-10-15',
  runtime: 139,
  status: 'Released',
  originalLanguage: 'en',
  budget: 63000000,
  revenue: 101200000,
  posterPath: '/pB8BM7pdSp6B6Ih7QI4S2t015wi.jpg',
  backdropPath: '/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg',
  voteAverage: 8.4,
  voteCount: 28000,
  genres: [
    { id: 18, name: 'Drama' },
    { id: 53, name: 'Thriller' },
  ],
  productionCompanies: [{ id: 508, name: 'Regency Enterprises' }],
  spokenLanguages: [{ iso_639_1: 'en', name: 'English' }],
};

beforeEach(async () => {
  mockImageCache.downloadMovieImages.mockClear();
  mockImageCache.deleteMovieImages.mockClear();
  ({ caller, db } = ctx.setup());

  // Reset the mock for each test
  const { TmdbClient } = await import('../tmdb/client.js');
  const MockTmdbClient = vi.mocked(TmdbClient);
  MockTmdbClient.mockImplementation(function () {
    return {
      getMovie: vi.fn().mockResolvedValue(MOCK_TMDB_DETAIL),
      searchMovies: vi.fn(),
      getMovieImages: vi.fn(),
      getGenreList: vi.fn(),
    } as unknown as InstanceType<typeof TmdbClient>;
  });
});

afterEach(() => {
  ctx.teardown();
});

describe('library.addMovie', () => {
  it('fetches from TMDB and creates a new movie', async () => {
    const result = await caller.media.library.addMovie({ tmdbId: 550 });

    expect(result.created).toBe(true);
    expect(result.message).toBe('Movie added to library');
    expect(result.data.tmdbId).toBe(550);
    expect(result.data.title).toBe('Fight Club');
    expect(result.data.imdbId).toBe('tt0137523');
    expect(result.data.overview).toContain('insomniac');
    expect(result.data.tagline).toBe('Mischief. Mayhem. Soap.');
    expect(result.data.runtime).toBe(139);
    expect(result.data.genres).toEqual(['Drama', 'Thriller']);
    expect(result.data.posterPath).toBe('/media/images/movie/550/poster.jpg');
  });

  it('returns existing movie without calling TMDB (idempotent)', async () => {
    // Pre-seed a movie with the same tmdbId
    seedMovie(db, {
      tmdb_id: 550,
      title: 'Fight Club (existing)',
      genres: '["Drama"]',
    });

    const result = await caller.media.library.addMovie({ tmdbId: 550 });

    expect(result.created).toBe(false);
    expect(result.message).toBe('Movie already in library');
    expect(result.data.tmdbId).toBe(550);
    expect(result.data.title).toBe('Fight Club (existing)');
  });

  it('maps genre names correctly from TMDB detail', async () => {
    const { TmdbClient } = await import('../tmdb/client.js');
    const MockTmdbClient = vi.mocked(TmdbClient);
    MockTmdbClient.mockImplementation(function () {
      return {
        getMovie: vi.fn().mockResolvedValue({
          ...MOCK_TMDB_DETAIL,
          genres: [
            { id: 28, name: 'Action' },
            { id: 12, name: 'Adventure' },
            { id: 878, name: 'Science Fiction' },
          ],
        }),
        searchMovies: vi.fn(),
        getMovieImages: vi.fn(),
        getGenreList: vi.fn(),
      } as unknown as InstanceType<typeof TmdbClient>;
    });

    const result = await caller.media.library.addMovie({ tmdbId: 550 });

    expect(result.data.genres).toEqual(['Action', 'Adventure', 'Science Fiction']);
  });

  it('throws NOT_FOUND when TMDB returns 404', async () => {
    const { TmdbClient } = await import('../tmdb/client.js');
    const MockTmdbClient = vi.mocked(TmdbClient);
    MockTmdbClient.mockImplementation(function () {
      return {
        getMovie: vi.fn().mockRejectedValue(new TmdbApiError(404, 'Not Found')),
        searchMovies: vi.fn(),
        getMovieImages: vi.fn(),
        getGenreList: vi.fn(),
      } as unknown as InstanceType<typeof TmdbClient>;
    });

    await expect(caller.media.library.addMovie({ tmdbId: 999999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws INTERNAL_SERVER_ERROR on TMDB API failure', async () => {
    const { TmdbClient } = await import('../tmdb/client.js');
    const MockTmdbClient = vi.mocked(TmdbClient);
    MockTmdbClient.mockImplementation(function () {
      return {
        getMovie: vi.fn().mockRejectedValue(new TmdbApiError(500, 'Internal Server Error')),
        searchMovies: vi.fn(),
        getMovieImages: vi.fn(),
        getGenreList: vi.fn(),
      } as unknown as InstanceType<typeof TmdbClient>;
    });

    await expect(caller.media.library.addMovie({ tmdbId: 550 })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('rejects unauthenticated calls', async () => {
    const anonCaller = createCaller(false);
    await expect(anonCaller.media.library.addMovie({ tmdbId: 550 })).rejects.toThrow(TRPCError);
  });

  it('calls downloadMovieImages after creating a new movie', async () => {
    await caller.media.library.addMovie({ tmdbId: 550 });

    expect(mockImageCache.downloadMovieImages).toHaveBeenCalledWith(
      550,
      MOCK_TMDB_DETAIL.posterPath,
      MOCK_TMDB_DETAIL.backdropPath,
      null
    );
  });

  it('does not call downloadMovieImages for existing movie (idempotent)', async () => {
    seedMovie(db, { tmdb_id: 550, title: 'Fight Club (existing)', genres: '["Drama"]' });

    await caller.media.library.addMovie({ tmdbId: 550 });

    expect(mockImageCache.downloadMovieImages).not.toHaveBeenCalled();
  });
});

describe('library.refreshMovie — image cache', () => {
  it('re-downloads images when redownloadImages is true', async () => {
    const movieId = seedMovie(db, {
      tmdb_id: 550,
      title: 'Fight Club',
      genres: '["Drama"]',
    });

    await caller.media.library.refreshMovie({ id: movieId, redownloadImages: true });

    expect(mockImageCache.deleteMovieImages).toHaveBeenCalledWith(550);
    expect(mockImageCache.downloadMovieImages).toHaveBeenCalledWith(
      550,
      MOCK_TMDB_DETAIL.posterPath,
      MOCK_TMDB_DETAIL.backdropPath,
      null
    );
  });

  it('does not re-download images when redownloadImages is false (default)', async () => {
    const movieId = seedMovie(db, {
      tmdb_id: 550,
      title: 'Fight Club',
      genres: '["Drama"]',
    });

    await caller.media.library.refreshMovie({ id: movieId });

    expect(mockImageCache.deleteMovieImages).not.toHaveBeenCalled();
    expect(mockImageCache.downloadMovieImages).not.toHaveBeenCalled();
  });
});
