/**
 * Integration tests for the `/media/images/:mediaType/:id/:filename` byte
 * route, driven through the real Express app via supertest.
 *
 * The route's tier-2/3 fallbacks (download-and-cache, TMDB poster lookup) are
 * the only network-touching surface, so the TMDB client + image-cache
 * factories are mocked at the module boundary; nothing here performs HTTP.
 * Tier-1 (serve a cached file) is exercised against a real file written into a
 * temp `MEDIA_IMAGES_DIR`, so the bytes assertion proves the on-disk path
 * end-to-end.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { moviesService, openMediaDb, tvShowsService, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { TmdbClient } from '../clients/tmdb/client.js';
import { ImageCacheService } from '../clients/tmdb/image-cache.js';

import type { TmdbMovieDetail } from '../clients/tmdb/types.js';

const { getTmdbClientMock, getImageCacheMock } = vi.hoisted(() => ({
  getTmdbClientMock: vi.fn<() => TmdbClient>(),
  getImageCacheMock: vi.fn<() => ImageCacheService>(),
}));

vi.mock('../clients/tmdb/index.js', async () => {
  const actual = await vi.importActual<typeof import('../clients/tmdb/index.js')>(
    '../clients/tmdb/index.js'
  );
  return { ...actual, getTmdbClient: getTmdbClientMock, getImageCache: getImageCacheMock };
});

let tmpDir: string;
let imagesDir: string;
let mediaDb: OpenedMediaDb;
let tmdb: TmdbClient;
let imageCache: ImageCacheService;

function movieDetail(overrides: Partial<TmdbMovieDetail> = {}): TmdbMovieDetail {
  return {
    tmdbId: 550,
    imdbId: 'tt0137523',
    title: 'Fight Club',
    originalTitle: 'Fight Club',
    overview: '',
    tagline: '',
    releaseDate: '1999-10-15',
    runtime: 139,
    status: 'Released',
    originalLanguage: 'en',
    budget: 0,
    revenue: 0,
    posterPath: null,
    backdropPath: null,
    voteAverage: 8.4,
    voteCount: 27000,
    genres: [],
    productionCompanies: [],
    spokenLanguages: [],
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-images-test-'));
  imagesDir = join(tmpDir, 'images');
  mkdirSync(imagesDir, { recursive: true });
  vi.stubEnv('MEDIA_IMAGES_DIR', imagesDir);

  mediaDb = openMediaDb(join(tmpDir, 'media.db'));

  tmdb = new TmdbClient('test-key');
  imageCache = new ImageCacheService(imagesDir);
  vi.spyOn(imageCache, 'downloadMovieImages').mockResolvedValue();
  vi.spyOn(imageCache, 'downloadTvShowImages').mockResolvedValue();

  getTmdbClientMock.mockReturnValue(tmdb);
  getImageCacheMock.mockReturnValue(imageCache);
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function app() {
  return createMediaApiApp({
    mediaDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3003',
  });
}

function writeCachedImage(mediaDirName: string, id: number, filename: string, bytes: Buffer): void {
  const dir = join(imagesDir, mediaDirName, String(id));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), bytes);
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('GET /media/images — tier 1 (cached file)', () => {
  it('serves a cached poster with its bytes and content-type', async () => {
    writeCachedImage('movies', 550, 'poster.jpg', JPEG_MAGIC);

    const res = await supertest(app()).get('/media/images/movie/550/poster.jpg');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.from(res.body)).toEqual(JPEG_MAGIC);
    expect(res.headers['cache-control']).toBe('public, max-age=604800');
    expect(getImageCacheMock).not.toHaveBeenCalled();
  });

  it('prefers override.jpg over poster.jpg for poster requests', async () => {
    const override = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 4]);
    writeCachedImage('movies', 550, 'poster.jpg', JPEG_MAGIC);
    writeCachedImage('movies', 550, 'override.jpg', override);

    const res = await supertest(app()).get('/media/images/movie/550/poster.jpg');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body)).toEqual(override);
  });

  it('serves tv images from the tv/ directory (not tvs/)', async () => {
    writeCachedImage('tv', 81189, 'poster.jpg', JPEG_MAGIC);

    const res = await supertest(app()).get('/media/images/tv/81189/poster.jpg');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body)).toEqual(JPEG_MAGIC);
  });

  it('deletes a corrupted SVG placeholder rather than serving it', async () => {
    writeCachedImage('movies', 550, 'backdrop.jpg', Buffer.from('<svg xmlns="...">'));

    const res = await supertest(app()).get('/media/images/movie/550/backdrop.jpg');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Image not found');
  });
});

describe('GET /media/images — validation', () => {
  it('returns 400 for an invalid media type', async () => {
    const res = await supertest(app()).get('/media/images/tvshow/550/poster.jpg');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid media type');
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await supertest(app()).get('/media/images/movie/abc/poster.jpg');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid id');
  });

  it('returns 400 for an unknown filename', async () => {
    const res = await supertest(app()).get('/media/images/movie/550/malicious.exe');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid filename');
  });

  it('accepts season_N.jpg as a valid filename', async () => {
    writeCachedImage('tv', 81189, 'season_2.jpg', JPEG_MAGIC);

    const res = await supertest(app()).get('/media/images/tv/81189/season_2.jpg');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body)).toEqual(JPEG_MAGIC);
  });
});

describe('GET /media/images — tier 3 (404 / CDN fallback, no network)', () => {
  it('returns 404 when no cached file exists and the DB has no record', async () => {
    const res = await supertest(app()).get('/media/images/movie/9999/poster.jpg');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Image not found');
    expect(getTmdbClientMock).not.toHaveBeenCalled();
    expect(imageCache.downloadMovieImages).not.toHaveBeenCalled();
  });

  it('returns 404 for override.jpg without attempting any download', async () => {
    const res = await supertest(app()).get('/media/images/movie/550/override.jpg');

    expect(res.status).toBe(404);
    expect(imageCache.downloadMovieImages).not.toHaveBeenCalled();
    expect(getTmdbClientMock).not.toHaveBeenCalled();
  });

  it('redirects to the TMDB CDN when the movie has a stored poster path but no cached file', async () => {
    moviesService.createMovie(mediaDb.db, {
      tmdbId: 550,
      title: 'Fight Club',
      posterPath: '/stored.jpg',
    });

    const res = await supertest(app()).get('/media/images/movie/550/poster.jpg');

    expect(imageCache.downloadMovieImages).toHaveBeenCalledWith(550, '/stored.jpg', null, null);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://image.tmdb.org/t/p/w780/stored.jpg');
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('redirects to the stored TheTVDB URL when a tv show has a stored poster path', async () => {
    tvShowsService.createTvShow(mediaDb.db, {
      tvdbId: 81189,
      name: 'Breaking Bad',
      posterPath: 'https://artworks.thetvdb.com/poster.jpg',
    });

    const res = await supertest(app()).get('/media/images/tv/81189/poster.jpg');

    expect(imageCache.downloadTvShowImages).toHaveBeenCalledWith({
      tvdbId: 81189,
      posterUrl: 'https://artworks.thetvdb.com/poster.jpg',
      backdropUrl: null,
      logoUrl: null,
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://artworks.thetvdb.com/poster.jpg');
  });
});

describe('GET /media/images — TMDB poster-path lookup (mocked)', () => {
  it('fetches the poster path from TMDB when the movie record exists but has none', async () => {
    moviesService.createMovie(mediaDb.db, { tmdbId: 550, title: 'Fight Club', posterPath: null });
    const getMovie = vi
      .spyOn(tmdb, 'getMovie')
      .mockResolvedValue(movieDetail({ posterPath: '/tmdb-fetched.jpg' }));

    const res = await supertest(app()).get('/media/images/movie/550/poster.jpg');

    expect(getMovie).toHaveBeenCalledWith(550);
    expect(imageCache.downloadMovieImages).toHaveBeenCalledWith(
      550,
      '/tmdb-fetched.jpg',
      null,
      null
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://image.tmdb.org/t/p/w780/tmdb-fetched.jpg');
  });

  it('returns 404 when neither the DB nor TMDB yields a poster path', async () => {
    moviesService.createMovie(mediaDb.db, { tmdbId: 550, title: 'Fight Club', posterPath: null });
    const getMovie = vi
      .spyOn(tmdb, 'getMovie')
      .mockResolvedValue(movieDetail({ posterPath: null }));

    const res = await supertest(app()).get('/media/images/movie/550/poster.jpg');

    expect(getMovie).toHaveBeenCalledWith(550);
    expect(imageCache.downloadMovieImages).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it('does not call TMDB for a backdrop with a null stored path', async () => {
    moviesService.createMovie(mediaDb.db, { tmdbId: 550, title: 'Fight Club', backdropPath: null });
    const getMovie = vi.spyOn(tmdb, 'getMovie');

    const res = await supertest(app()).get('/media/images/movie/550/backdrop.jpg');

    expect(getMovie).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it('returns 404 when the TMDB lookup throws', async () => {
    moviesService.createMovie(mediaDb.db, { tmdbId: 550, title: 'Fight Club', posterPath: null });
    vi.spyOn(tmdb, 'getMovie').mockRejectedValue(new Error('TMDB unavailable'));

    const res = await supertest(app()).get('/media/images/movie/550/poster.jpg');

    expect(res.status).toBe(404);
  });
});
