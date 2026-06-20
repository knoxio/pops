/**
 * Integration tests for the `library.*` add/refresh mutations via supertest.
 *
 * The TMDB / TheTVDB client + image-cache factories are mocked at the module
 * boundary; the factories return real client instances whose network methods
 * are spied so no HTTP is performed. Image-cache writes are stubbed to no-ops.
 * These exercise the full handler → use-case → db-service path against an
 * on-disk SQLite copy, asserting the wire shapes the FE depends on.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { TheTvdbAuth } from '../clients/thetvdb/auth.js';
import { TheTvdbClient } from '../clients/thetvdb/client.js';
import { TvdbApiError } from '../clients/thetvdb/types.js';
import { TmdbClient } from '../clients/tmdb/client.js';
import { ImageCacheService } from '../clients/tmdb/image-cache.js';
import { TmdbApiError } from '../clients/tmdb/types.js';
import { makeClient } from './test-utils.js';

import type { TvdbEpisode, TvdbShowDetail } from '../clients/thetvdb/types.js';
import type { TmdbMovieDetail } from '../clients/tmdb/types.js';

const { getTmdbClientMock, getImageCacheMock, getTvdbClientMock } = vi.hoisted(() => ({
  getTmdbClientMock: vi.fn<() => TmdbClient>(),
  getImageCacheMock: vi.fn<() => ImageCacheService>(),
  getTvdbClientMock: vi.fn<() => TheTvdbClient>(),
}));

vi.mock('../clients/tmdb/index.js', async () => {
  const actual = await vi.importActual<typeof import('../clients/tmdb/index.js')>(
    '../clients/tmdb/index.js'
  );
  return { ...actual, getTmdbClient: getTmdbClientMock, getImageCache: getImageCacheMock };
});

vi.mock('../clients/thetvdb/index.js', async () => {
  const actual = await vi.importActual<typeof import('../clients/thetvdb/index.js')>(
    '../clients/thetvdb/index.js'
  );
  return { ...actual, getTvdbClient: getTvdbClientMock };
});

function movieDetail(overrides: Partial<TmdbMovieDetail> = {}): TmdbMovieDetail {
  return {
    tmdbId: 603,
    imdbId: 'tt0133093',
    title: 'The Matrix',
    originalTitle: 'The Matrix',
    overview: 'A hacker learns the truth.',
    tagline: 'Free your mind.',
    releaseDate: '1999-03-31',
    runtime: 136,
    status: 'Released',
    originalLanguage: 'en',
    budget: 63000000,
    revenue: 463517383,
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    voteAverage: 8.2,
    voteCount: 24000,
    genres: [
      { id: 28, name: 'Action' },
      { id: 878, name: 'Science Fiction' },
    ],
    productionCompanies: [],
    spokenLanguages: [],
    ...overrides,
  };
}

function showDetail(overrides: Partial<TvdbShowDetail> = {}): TvdbShowDetail {
  return {
    tvdbId: 81189,
    name: 'Breaking Bad',
    originalName: 'Breaking Bad',
    overview: 'A chemistry teacher turns to crime.',
    firstAirDate: '2008-01-20',
    lastAirDate: '2013-09-29',
    status: 'Ended',
    originalLanguage: 'eng',
    averageRuntime: 47,
    genres: [{ id: 1, name: 'Drama' }],
    networks: [{ id: 2, name: 'AMC' }],
    seasons: [
      {
        tvdbId: 1001,
        seasonNumber: 0,
        name: 'Specials',
        overview: null,
        imageUrl: null,
        episodeCount: 0,
      },
      {
        tvdbId: 1002,
        seasonNumber: 1,
        name: 'Season 1',
        overview: null,
        imageUrl: '/s1.jpg',
        episodeCount: 2,
      },
    ],
    artworks: [
      { id: 1, type: 2, imageUrl: 'https://tvdb/poster-eng.jpg', language: 'eng', score: 10 },
      { id: 2, type: 2, imageUrl: 'https://tvdb/poster-jpn.jpg', language: 'jpn', score: 99 },
      { id: 3, type: 3, imageUrl: 'https://tvdb/backdrop.jpg', language: 'eng', score: 5 },
    ],
    ...overrides,
  };
}

function episode(tvdbId: number, episodeNumber: number, seasonNumber: number): TvdbEpisode {
  return {
    tvdbId,
    episodeNumber,
    seasonNumber,
    name: `Episode ${episodeNumber}`,
    overview: null,
    airDate: '2008-01-20',
    runtime: 47,
    imageUrl: null,
  };
}

let tmpDir: string;
let mediaDb: OpenedMediaDb;
let tmdb: TmdbClient;
let tvdb: TheTvdbClient;
let imageCache: ImageCacheService;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-library-mut-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));

  tmdb = new TmdbClient('test-key');
  tvdb = new TheTvdbClient(new TheTvdbAuth('test-key'));
  imageCache = new ImageCacheService(join(tmpDir, 'images'));

  vi.spyOn(imageCache, 'downloadMovieImages').mockResolvedValue();
  vi.spyOn(imageCache, 'deleteMovieImages').mockResolvedValue();
  vi.spyOn(imageCache, 'downloadTvShowImages').mockResolvedValue();
  vi.spyOn(imageCache, 'deleteTvShowImages').mockResolvedValue();

  getTmdbClientMock.mockReturnValue(tmdb);
  getTvdbClientMock.mockReturnValue(tvdb);
  getImageCacheMock.mockReturnValue(imageCache);
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function client() {
  return makeClient(
    createMediaApiApp({ mediaDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3003' })
  );
}

describe('library — addMovie', () => {
  it('creates a movie from TMDB detail and caches its images', async () => {
    const getMovie = vi.spyOn(tmdb, 'getMovie').mockResolvedValue(movieDetail());

    const res = await client().library.addMovie(603);

    expect(getMovie).toHaveBeenCalledWith(603);
    expect(res.created).toBe(true);
    expect(res.message).toBe('Movie added to library');
    expect(res.data.tmdbId).toBe(603);
    expect(res.data.title).toBe('The Matrix');
    expect(res.data.genres).toEqual(['Action', 'Science Fiction']);
    expect(res.data.posterUrl).toBe('/media/images/movie/603/poster.jpg');
    expect(imageCache.downloadMovieImages).toHaveBeenCalledWith(
      603,
      '/poster.jpg',
      '/backdrop.jpg',
      null
    );

    const listed = await client().library.list();
    expect(listed.data.map((i) => i.title)).toContain('The Matrix');
  });

  it('is idempotent — a movie already in the library returns created=false without a TMDB fetch', async () => {
    const getMovie = vi.spyOn(tmdb, 'getMovie').mockResolvedValue(movieDetail());
    await client().library.addMovie(603);
    getMovie.mockClear();

    const res = await client().library.addMovie(603);

    expect(res.created).toBe(false);
    expect(res.message).toBe('Movie already in library');
    expect(getMovie).not.toHaveBeenCalled();
  });

  it('maps a TMDB 404 to a 404 response', async () => {
    vi.spyOn(tmdb, 'getMovie').mockRejectedValue(new TmdbApiError(404, 'Not found'));
    await expect(client().library.addMovie(999999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('library — refreshMovie', () => {
  it('updates an existing movie from fresh TMDB detail', async () => {
    vi.spyOn(tmdb, 'getMovie').mockResolvedValueOnce(
      movieDetail({ title: 'Old Title', voteAverage: 5 })
    );
    const added = await client().library.addMovie(603);

    vi.spyOn(tmdb, 'getMovie').mockResolvedValue(
      movieDetail({ title: 'The Matrix Reloaded', voteAverage: 9.1 })
    );
    const res = await client().library.refreshMovie(added.data.id, { redownloadImages: true });

    expect(res.message).toBe('Movie metadata refreshed');
    expect(res.data.title).toBe('The Matrix Reloaded');
    expect(res.data.voteAverage).toBe(9.1);
    expect(imageCache.deleteMovieImages).toHaveBeenCalledWith(603);
    expect(imageCache.downloadMovieImages).toHaveBeenLastCalledWith(
      603,
      '/poster.jpg',
      '/backdrop.jpg',
      null
    );
  });

  it('does not redownload images when redownloadImages is false (the default)', async () => {
    vi.spyOn(tmdb, 'getMovie').mockResolvedValue(movieDetail());
    const added = await client().library.addMovie(603);
    vi.mocked(imageCache.deleteMovieImages).mockClear();

    await client().library.refreshMovie(added.data.id);

    expect(imageCache.deleteMovieImages).not.toHaveBeenCalled();
  });

  it('maps a missing movie to a 404 response', async () => {
    await expect(client().library.refreshMovie(424242)).rejects.toMatchObject({ status: 404 });
  });
});

describe('library — addTvShow', () => {
  it('creates a show with its seasons and episodes from TheTVDB detail', async () => {
    vi.spyOn(tvdb, 'getSeriesExtended').mockResolvedValue(showDetail());
    vi.spyOn(tvdb, 'getSeriesEpisodes').mockImplementation((_id, seasonNumber) =>
      Promise.resolve(seasonNumber === 1 ? [episode(5001, 1, 1), episode(5002, 2, 1)] : [])
    );

    const res = await client().library.addTvShow(81189);

    expect(res.created).toBe(true);
    expect(res.message).toBe('TV show added to library');
    expect(res.data.show.tvdbId).toBe(81189);
    expect(res.data.show.name).toBe('Breaking Bad');
    expect(res.data.show.numberOfSeasons).toBe(1);
    expect(res.data.show.numberOfEpisodes).toBe(2);
    expect(res.data.show.networks).toEqual(['AMC']);
    expect(res.data.seasons).toHaveLength(2);

    const seasonOne = res.data.seasons.find((s) => s.seasonNumber === 1);
    expect(seasonOne?.episodeCount).toBe(2);

    const episodes = await client().tvShows.listEpisodes(seasonOne!.id);
    expect(episodes.data.map((e) => e.episodeNumber)).toEqual([1, 2]);
  });

  it('prefers the English-language poster artwork over a higher-scored foreign one', async () => {
    vi.spyOn(tvdb, 'getSeriesExtended').mockResolvedValue(showDetail());
    vi.spyOn(tvdb, 'getSeriesEpisodes').mockResolvedValue([]);

    await client().library.addTvShow(81189);

    expect(imageCache.downloadTvShowImages).toHaveBeenCalledWith(
      expect.objectContaining({
        tvdbId: 81189,
        posterUrl: 'https://tvdb/poster-eng.jpg',
        backdropUrl: 'https://tvdb/backdrop.jpg',
      })
    );
  });

  it('is idempotent — an already-present show returns created=false without a TheTVDB fetch', async () => {
    vi.spyOn(tvdb, 'getSeriesExtended').mockResolvedValue(showDetail());
    vi.spyOn(tvdb, 'getSeriesEpisodes').mockResolvedValue([]);
    await client().library.addTvShow(81189);

    const getSeries = vi.spyOn(tvdb, 'getSeriesExtended').mockClear();
    const res = await client().library.addTvShow(81189);

    expect(res.created).toBe(false);
    expect(res.message).toBe('TV show already in library');
    expect(getSeries).not.toHaveBeenCalled();
    expect(res.data.seasons).toHaveLength(2);
  });
});

describe('library — refreshTvShow', () => {
  async function seedShow() {
    vi.spyOn(tvdb, 'getSeriesExtended').mockResolvedValue(showDetail());
    vi.spyOn(tvdb, 'getSeriesEpisodes').mockImplementation((_id, seasonNumber) =>
      Promise.resolve(seasonNumber === 1 ? [episode(5001, 1, 1)] : [])
    );
    return client().library.addTvShow(81189);
  }

  it('reports add/update counts for seasons and episodes', async () => {
    const added = await seedShow();
    vi.restoreAllMocks();
    vi.spyOn(imageCache, 'downloadTvShowImages').mockResolvedValue();
    vi.spyOn(imageCache, 'deleteTvShowImages').mockResolvedValue();

    vi.spyOn(tvdb, 'getSeriesExtended').mockResolvedValue(
      showDetail({
        seasons: [
          {
            tvdbId: 1001,
            seasonNumber: 0,
            name: 'Specials',
            overview: null,
            imageUrl: null,
            episodeCount: 0,
          },
          {
            tvdbId: 1002,
            seasonNumber: 1,
            name: 'Season 1',
            overview: null,
            imageUrl: '/s1.jpg',
            episodeCount: 2,
          },
          {
            tvdbId: 1003,
            seasonNumber: 2,
            name: 'Season 2',
            overview: null,
            imageUrl: '/s2.jpg',
            episodeCount: 1,
          },
        ],
      })
    );
    vi.spyOn(tvdb, 'getSeriesEpisodes').mockImplementation((_id, seasonNumber) => {
      if (seasonNumber === 1) return Promise.resolve([episode(5001, 1, 1), episode(5003, 2, 1)]);
      if (seasonNumber === 2) return Promise.resolve([episode(5004, 1, 2)]);
      return Promise.resolve([]);
    });

    const res = await client().library.refreshTvShow(added.data.show.id, { refreshEpisodes: true });

    expect(res.message).toBe('TV show metadata refreshed');
    expect(res.seasonsAdded).toBe(1);
    expect(res.seasonsUpdated).toBe(2);
    expect(res.episodesAdded).toBe(2);
    expect(res.episodesUpdated).toBe(1);
    expect(res.data.show.numberOfEpisodes).toBe(3);
    expect(res.data.seasons).toHaveLength(3);
  });

  it('skips episode fetches when refreshEpisodes is false', async () => {
    const added = await seedShow();
    vi.restoreAllMocks();
    vi.spyOn(imageCache, 'downloadTvShowImages').mockResolvedValue();
    vi.spyOn(tvdb, 'getSeriesExtended').mockResolvedValue(showDetail());
    const getEpisodes = vi.spyOn(tvdb, 'getSeriesEpisodes').mockResolvedValue([]);

    const res = await client().library.refreshTvShow(added.data.show.id, {
      refreshEpisodes: false,
    });

    expect(getEpisodes).not.toHaveBeenCalled();
    expect(res.episodesAdded).toBe(0);
    expect(res.episodesUpdated).toBe(0);
  });

  it('maps a missing show to a 404 response', async () => {
    vi.spyOn(tvdb, 'getSeriesExtended').mockRejectedValue(new TvdbApiError(404, 'nope'));
    await expect(client().library.refreshTvShow(999999)).rejects.toMatchObject({ status: 404 });
  });
});
