/**
 * TMDB client unit tests — all HTTP calls mocked via vi.stubGlobal("fetch").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TmdbClient } from './client.js';
import { TokenBucketRateLimiter } from './rate-limiter.js';
import { TmdbApiError } from './types.js';

import type { RawTmdbImageResponse, RawTmdbMovieDetail, RawTmdbSearchResponse } from './types.js';

/** Helper to create a mocked Response. */
function mockResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockResponse(body, status, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

const FAKE_KEY = 'test-tmdb-api-key-123';

let client: TmdbClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  client = new TmdbClient(FAKE_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TmdbClient constructor', () => {
  it('throws if API key is empty', () => {
    expect(() => new TmdbClient('')).toThrow('TMDB API key is required');
  });

  it('accepts a valid API key', () => {
    expect(() => new TmdbClient('valid-key')).not.toThrow();
  });
});

describe('TmdbClient authentication', () => {
  it('sends Bearer token in Authorization header', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ page: 1, results: [], total_results: 0, total_pages: 0 })
    );

    await client.searchMovies('test');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`);
  });
});

describe('searchMovies', () => {
  const rawSearch: RawTmdbSearchResponse = {
    page: 1,
    total_results: 2,
    total_pages: 1,
    results: [
      {
        id: 550,
        title: 'Fight Club',
        original_title: 'Fight Club',
        overview: 'An insomniac office worker...',
        release_date: '1999-10-15',
        poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
        backdrop_path: '/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg',
        vote_average: 8.4,
        vote_count: 25000,
        genre_ids: [18, 53],
        original_language: 'en',
        popularity: 55.3,
      },
      {
        id: 680,
        title: 'Pulp Fiction',
        original_title: 'Pulp Fiction',
        overview: 'A burger-loving hit man...',
        release_date: '1994-09-10',
        poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
        backdrop_path: null,
        vote_average: 8.5,
        vote_count: 24000,
        genre_ids: [53, 80],
        original_language: 'en',
        popularity: 48.1,
      },
    ],
  };

  it('returns mapped search results', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawSearch));

    const result = await client.searchMovies('fight');

    expect(result.page).toBe(1);
    expect(result.totalResults).toBe(2);
    expect(result.totalPages).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      tmdbId: 550,
      title: 'Fight Club',
      originalTitle: 'Fight Club',
      overview: 'An insomniac office worker...',
      releaseDate: '1999-10-15',
      posterPath: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
      backdropPath: '/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg',
      voteAverage: 8.4,
      voteCount: 25000,
      genreIds: [18, 53],
      originalLanguage: 'en',
      popularity: 55.3,
    });
  });

  it('passes query and page as URL parameters', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ page: 3, results: [], total_results: 0, total_pages: 5 })
    );

    await client.searchMovies('inception', 3);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('query=inception');
    expect(url).toContain('page=3');
    expect(url).toContain('language=en-US');
  });

  it('defaults page to 1', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ page: 1, results: [], total_results: 0, total_pages: 0 })
    );

    await client.searchMovies('test');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('page=1');
  });

  it('handles null backdrop_path in results', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawSearch));

    const result = await client.searchMovies('pulp');

    expect(result.results[1]!.backdropPath).toBeNull();
  });
});

describe('getMovie', () => {
  const rawDetail: RawTmdbMovieDetail = {
    id: 550,
    imdb_id: 'tt0137523',
    title: 'Fight Club',
    original_title: 'Fight Club',
    overview: 'An insomniac office worker...',
    tagline: 'Mischief. Mayhem. Soap.',
    release_date: '1999-10-15',
    runtime: 139,
    status: 'Released',
    original_language: 'en',
    budget: 63000000,
    revenue: 101200000,
    poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    backdrop_path: '/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg',
    vote_average: 8.4,
    vote_count: 25000,
    genres: [
      { id: 18, name: 'Drama' },
      { id: 53, name: 'Thriller' },
    ],
    production_companies: [{ id: 508, name: 'Regency Enterprises' }],
    spoken_languages: [{ iso_639_1: 'en', name: 'English' }],
  };

  it('returns mapped movie detail', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawDetail));

    const result = await client.getMovie(550);

    expect(result.tmdbId).toBe(550);
    expect(result.imdbId).toBe('tt0137523');
    expect(result.title).toBe('Fight Club');
    expect(result.tagline).toBe('Mischief. Mayhem. Soap.');
    expect(result.runtime).toBe(139);
    expect(result.genres).toEqual([
      { id: 18, name: 'Drama' },
      { id: 53, name: 'Thriller' },
    ]);
    expect(result.productionCompanies).toEqual([{ id: 508, name: 'Regency Enterprises' }]);
    expect(result.spokenLanguages).toEqual([{ iso_639_1: 'en', name: 'English' }]);
  });

  it('calls correct URL with tmdbId', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawDetail));

    await client.getMovie(550);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/3/movie/550');
    expect(url).toContain('language=en-US');
  });

  it('handles null imdb_id', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ...rawDetail, imdb_id: null }));

    const result = await client.getMovie(550);
    expect(result.imdbId).toBeNull();
  });
});

describe('getMovieImages', () => {
  const rawImages: RawTmdbImageResponse = {
    id: 550,
    backdrops: [
      {
        file_path: '/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg',
        width: 1920,
        height: 1080,
        aspect_ratio: 1.778,
        vote_average: 5.5,
        vote_count: 10,
        iso_639_1: null,
      },
    ],
    posters: [
      {
        file_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
        width: 500,
        height: 750,
        aspect_ratio: 0.667,
        vote_average: 5.3,
        vote_count: 8,
        iso_639_1: 'en',
      },
    ],
    logos: [
      {
        file_path: '/logo123.png',
        width: 400,
        height: 200,
        aspect_ratio: 2.0,
        vote_average: 4.0,
        vote_count: 2,
        iso_639_1: 'en',
      },
    ],
  };

  it('returns mapped image response', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawImages));

    const result = await client.getMovieImages(550);

    expect(result.id).toBe(550);
    expect(result.backdrops).toHaveLength(1);
    expect(result.backdrops[0]!.filePath).toBe('/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg');
    expect(result.backdrops[0]!.width).toBe(1920);
    expect(result.posters).toHaveLength(1);
    expect(result.posters[0]!.filePath).toBe('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');
    expect(result.posters[0]!.languageCode).toBe('en');
    expect(result.logos).toHaveLength(1);
    expect(result.logos[0]!.filePath).toBe('/logo123.png');
    expect(result.backdrops[0]!.languageCode).toBeNull();
  });

  it('calls correct images URL', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawImages));

    await client.getMovieImages(550);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/3/movie/550/images');
  });
});

describe('getGenreList', () => {
  it('returns genre list', async () => {
    const body = {
      genres: [
        { id: 28, name: 'Action' },
        { id: 35, name: 'Comedy' },
        { id: 18, name: 'Drama' },
      ],
    };
    fetchMock.mockResolvedValueOnce(mockResponse(body));

    const result = await client.getGenreList();

    expect(result.genres).toHaveLength(3);
    expect(result.genres[0]).toEqual({ id: 28, name: 'Action' });
    expect(result.genres[2]).toEqual({ id: 18, name: 'Drama' });
  });

  it('calls correct genre URL', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ genres: [] }));

    await client.getGenreList();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/3/genre/movie/list');
    expect(url).toContain('language=en-US');
  });
});

describe('error handling', () => {
  it('throws TmdbApiError on 404', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        { status_message: 'The resource you requested could not be found.' },
        404,
        'Not Found'
      )
    );

    await expect(client.getMovie(999999)).rejects.toThrow(TmdbApiError);

    try {
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          { status_message: 'The resource you requested could not be found.' },
          404,
          'Not Found'
        )
      );
      await client.getMovie(999999);
    } catch (err) {
      expect(err).toBeInstanceOf(TmdbApiError);
      expect((err as TmdbApiError).status).toBe(404);
      expect((err as TmdbApiError).message).toBe('The resource you requested could not be found.');
    }
  });

  it('throws TmdbApiError on 401 unauthorized', async () => {
    expect.assertions(3);
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        { status_message: 'Invalid API key: You must be granted a valid key.' },
        401,
        'Unauthorized'
      )
    );

    try {
      await client.searchMovies('test');
    } catch (err) {
      expect(err).toBeInstanceOf(TmdbApiError);
      expect((err as TmdbApiError).status).toBe(401);
      expect((err as TmdbApiError).message).toContain('Invalid API key');
    }
  });

  it('throws TmdbApiError on 429 rate limited', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        { status_message: 'Your request count is over the allowed limit.' },
        429,
        'Too Many Requests'
      )
    );

    await expect(client.searchMovies('test')).rejects.toThrow(TmdbApiError);

    fetchMock.mockResolvedValueOnce(
      mockResponse(
        { status_message: 'Your request count is over the allowed limit.' },
        429,
        'Too Many Requests'
      )
    );

    try {
      await client.searchMovies('test');
    } catch (err) {
      expect(err).toBeInstanceOf(TmdbApiError);
      expect((err as TmdbApiError).status).toBe(429);
    }
  });

  it('throws TmdbApiError on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));

    await expect(client.searchMovies('test')).rejects.toThrow(TmdbApiError);

    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));

    try {
      await client.searchMovies('test');
    } catch (err) {
      expect(err).toBeInstanceOf(TmdbApiError);
      expect((err as TmdbApiError).status).toBe(0);
      expect((err as TmdbApiError).message).toContain('Network error');
      expect((err as TmdbApiError).message).toContain('fetch failed');
    }
  });

  it('uses fallback message when error response has no status_message', async () => {
    expect.assertions(3);
    fetchMock.mockResolvedValueOnce(mockResponse({}, 500, 'Internal Server Error'));

    try {
      await client.getMovie(1);
    } catch (err) {
      expect(err).toBeInstanceOf(TmdbApiError);
      expect((err as TmdbApiError).status).toBe(500);
      expect((err as TmdbApiError).message).toContain('500');
    }
  });
});

describe('rate limiter integration', () => {
  it('calls acquire() before each request when rate limiter is provided', async () => {
    const limiter = new TokenBucketRateLimiter(40, 4);
    const acquireSpy = vi.spyOn(limiter, 'acquire');
    const rateLimitedClient = new TmdbClient(FAKE_KEY, limiter);

    fetchMock.mockResolvedValueOnce(
      mockResponse({ page: 1, results: [], total_results: 0, total_pages: 0 })
    );

    await rateLimitedClient.searchMovies('test');

    expect(acquireSpy).toHaveBeenCalledOnce();

    limiter.destroy();
  });

  it('does not call acquire() when no rate limiter is provided', async () => {
    // Default client has no rate limiter
    fetchMock.mockResolvedValueOnce(
      mockResponse({ page: 1, results: [], total_results: 0, total_pages: 0 })
    );

    await client.searchMovies('test');

    // Just verify the request succeeded without rate limiting
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
