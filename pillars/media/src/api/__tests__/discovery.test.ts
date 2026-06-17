/**
 * Integration tests for the `discovery.*` REST surface via supertest.
 *
 * Covers the discover surface ported from the pops-api monolith: the dismiss
 * pile round-trip, the preference profile reflecting seeded scores + genres,
 * from-your-server excluding watched + ordering by profile, TMDB trending /
 * recommendations shape (client mocked), the trendingPlex null stub, session
 * assembly (shelves with items, impressions recorded, dismissed excluded), and
 * shelf paging.
 *
 * The TMDB client is mocked at its factory boundary (`getTmdbClient`) — nothing
 * here performs network IO. The vitest suite runs sequentially with
 * `unstubGlobals`, so the mock can't bleed into other files.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { TmdbClient } from '../clients/tmdb/client.js';
import { makeClient } from './test-utils.js';

import type { TmdbSearchResponse, TmdbSearchResult } from '../clients/tmdb/types.js';

const { getTmdbClientMock } = vi.hoisted(() => ({ getTmdbClientMock: vi.fn<() => TmdbClient>() }));

vi.mock('../clients/tmdb/index.js', async () => {
  const actual = await vi.importActual<typeof import('../clients/tmdb/index.js')>(
    '../clients/tmdb/index.js'
  );
  return { ...actual, getTmdbClient: getTmdbClientMock };
});

let tmpDir: string;
let mediaDb: OpenedMediaDb;
let tmdb: TmdbClient;
let idSeq = 7000;

function tmdbResult(overrides: Partial<TmdbSearchResult> = {}): TmdbSearchResult {
  return {
    tmdbId: 999,
    title: 'Upstream Movie',
    originalTitle: 'Upstream Movie',
    overview: 'o',
    releaseDate: '2020-01-01',
    posterPath: '/p.jpg',
    backdropPath: '/b.jpg',
    voteAverage: 7.5,
    voteCount: 1000,
    genreIds: [28],
    originalLanguage: 'en',
    popularity: 50,
    ...overrides,
  };
}

function tmdbResponse(results: TmdbSearchResult[]): TmdbSearchResponse {
  return { results, page: 1, totalPages: 5, totalResults: results.length };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-disc-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
  tmdb = new TmdbClient('test-key');
  getTmdbClientMock.mockReturnValue(tmdb);
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

function nextId(): number {
  idSeq += 1;
  return idSeq;
}

async function makeMovie(title: string, extra: Record<string, unknown> = {}) {
  return (await client().movies.create({ tmdbId: nextId(), title, ...extra })).data;
}

async function firstDimensionId(): Promise<number> {
  const dims = await client().comparisons.listDimensions();
  const first = dims.data[0];
  if (!first) throw new Error('expected a seeded dimension');
  return first.id;
}

describe('discovery — dismiss pile', () => {
  it('round-trips dismiss / getDismissed / undismiss (idempotent)', async () => {
    expect((await client().discovery.getDismissed()).data).toEqual([]);

    await client().discovery.dismiss(101);
    await client().discovery.dismiss(101); // idempotent
    await client().discovery.dismiss(202);

    const dismissed = (await client().discovery.getDismissed()).data;
    expect(dismissed.toSorted((a, b) => a - b)).toEqual([101, 202]);

    await client().discovery.undismiss(101);
    expect((await client().discovery.getDismissed()).data).toEqual([202]);

    await client().discovery.undismiss(999); // absent → no-op
    expect((await client().discovery.getDismissed()).data).toEqual([202]);
  });
});

describe('discovery — preference profile', () => {
  it('reflects seeded comparisons, genre affinities, and watch distribution', async () => {
    const dimId = await firstDimensionId();
    const a = await makeMovie('Action A', { genres: ['Action'], voteAverage: 8 });
    const b = await makeMovie('Comedy B', { genres: ['Comedy'], voteAverage: 6 });

    await client().comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: a.id,
      mediaBType: 'movie',
      mediaBId: b.id,
      winnerType: 'movie',
      winnerId: a.id,
    });
    await client().watchHistory.log({ mediaType: 'movie', mediaId: a.id, completed: 1 });

    const profile = (await client().discovery.profile()).data;
    expect(profile.totalComparisons).toBe(1);
    const action = profile.genreAffinities.find((g) => g.genre === 'Action');
    const comedy = profile.genreAffinities.find((g) => g.genre === 'Comedy');
    expect(action).toBeDefined();
    expect(comedy).toBeDefined();
    // Winner gained ELO; loser dropped, so Action ranks above Comedy.
    expect(action?.avgScore ?? 0).toBeGreaterThan(comedy?.avgScore ?? 0);

    expect(profile.totalMoviesWatched).toBe(1);
    const watched = profile.genreDistribution.find((g) => g.genre === 'Action');
    expect(watched?.watchCount).toBe(1);
    expect(watched?.percentage).toBe(100);
  });
});

describe('discovery — from your server', () => {
  it('excludes watched movies and orders unwatched by profile match', async () => {
    const dimId = await firstDimensionId();
    const action = await makeMovie('Action Seed', { genres: ['Action'], voteAverage: 9 });
    const drama = await makeMovie('Drama Seed', { genres: ['Drama'], voteAverage: 5 });
    // Make Action the preferred genre.
    await client().comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: action.id,
      mediaBType: 'movie',
      mediaBId: drama.id,
      winnerType: 'movie',
      winnerId: action.id,
    });

    const unwatchedAction = await makeMovie('Unwatched Action', { genres: ['Action'] });
    const unwatchedDrama = await makeMovie('Unwatched Drama', { genres: ['Drama'] });
    const watchedMovie = await makeMovie('Watched One', { genres: ['Action'] });
    await client().watchHistory.log({ mediaType: 'movie', mediaId: watchedMovie.id, completed: 1 });

    const { results } = await client().discovery.fromYourServer();
    const ids = results.map((r) => r.tmdbId);
    expect(ids).not.toContain(watchedMovie.tmdbId);
    expect(ids).toContain(unwatchedAction.tmdbId);
    expect(ids).toContain(unwatchedDrama.tmdbId);

    // Action-genre unwatched movie scores higher than the drama one.
    const actionScore =
      results.find((r) => r.tmdbId === unwatchedAction.tmdbId)?.matchPercentage ?? 0;
    const dramaScore =
      results.find((r) => r.tmdbId === unwatchedDrama.tmdbId)?.matchPercentage ?? 0;
    expect(actionScore).toBeGreaterThan(dramaScore);
    // Sorted descending by match.
    expect(results[0]?.matchPercentage).toBeGreaterThanOrEqual(
      results.at(-1)?.matchPercentage ?? 0
    );
  });
});

describe('discovery — TMDB-backed (client mocked)', () => {
  it('returns flag-annotated trending, excluding dismissed', async () => {
    const inLib = await makeMovie('Library Hit', { genres: ['Action'] });
    await client().discovery.dismiss(555);
    vi.spyOn(tmdb, 'getTrendingMovies').mockResolvedValue(
      tmdbResponse([
        tmdbResult({ tmdbId: inLib.tmdbId, title: 'Library Hit' }),
        tmdbResult({ tmdbId: 444, title: 'Fresh' }),
        tmdbResult({ tmdbId: 555, title: 'Dismissed' }),
      ])
    );

    const { results } = await client().discovery.trending({ timeWindow: 'week' });
    const ids = results.map((r) => r.tmdbId);
    expect(ids).toContain(inLib.tmdbId);
    expect(ids).toContain(444);
    expect(ids).not.toContain(555); // dismissed filtered out
    const libHit = results.find((r) => r.tmdbId === inLib.tmdbId);
    expect(libHit?.inLibrary).toBe(true);
    expect(libHit?.posterUrl).toBe(`/media/images/movie/${inLib.tmdbId}/poster.jpg`);
    const fresh = results.find((r) => r.tmdbId === 444);
    expect(fresh?.inLibrary).toBe(false);
    expect(fresh?.posterUrl).toContain('image.tmdb.org');
  });

  it('guards recommendations below the cold-start comparison threshold', async () => {
    await makeMovie('Top Rated', { voteAverage: 9 });
    const spy = vi.spyOn(tmdb, 'getMovieRecommendations');
    const res = await client().discovery.recommendations();
    expect(res.results).toEqual([]);
    expect(res.totalComparisons).toBe(0);
    expect(spy).not.toHaveBeenCalled(); // no TMDB call when cold-starting
  });

  it('returns scored recommendations once past the cold-start threshold', async () => {
    const dimId = await firstDimensionId();
    // 6 comparisons clears the 5-comparison cold-start guard.
    for (let i = 0; i < 6; i++) {
      const a = await makeMovie(`Seed A${i}`, { genres: ['Action'], voteAverage: 9 });
      const b = await makeMovie(`Seed B${i}`, { genres: ['Drama'], voteAverage: 4 });
      await client().comparisons.record({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: a.id,
        mediaBType: 'movie',
        mediaBId: b.id,
        winnerType: 'movie',
        winnerId: a.id,
      });
    }
    vi.spyOn(tmdb, 'getMovieRecommendations').mockResolvedValue(
      tmdbResponse([tmdbResult({ tmdbId: 7777, title: 'Recommended', genreIds: [28] })])
    );

    const res = await client().discovery.recommendations({ sampleSize: 3 });
    expect(res.totalComparisons).toBe(6);
    expect(res.results.map((r) => r.tmdbId)).toContain(7777);
    expect(res.results[0]).toHaveProperty('matchPercentage');
  });

  it('returns context picks for the active collections, excluding dismissed', async () => {
    await client().discovery.dismiss(888);
    const discoverSpy = vi
      .spyOn(tmdb, 'discoverMovies')
      .mockResolvedValue(
        tmdbResponse([tmdbResult({ tmdbId: 321 }), tmdbResult({ tmdbId: 888, title: 'Dropped' })])
      );

    const { collections } = await client().discovery.contextPicks();
    expect(collections.length).toBeGreaterThan(0);
    expect(discoverSpy).toHaveBeenCalled();
    for (const col of collections) {
      expect(col.results.map((r) => r.tmdbId)).not.toContain(888);
    }
  });

  it('returns genre spotlight rows for the user top genres', async () => {
    const dimId = await firstDimensionId();
    const a = await makeMovie('Action Top', { genres: ['Action'], voteAverage: 9 });
    const b = await makeMovie('Drama Low', { genres: ['Drama'], voteAverage: 4 });
    await client().comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: a.id,
      mediaBType: 'movie',
      mediaBId: b.id,
      winnerType: 'movie',
      winnerId: a.id,
    });
    vi.spyOn(tmdb, 'discoverMovies').mockResolvedValue(
      tmdbResponse([tmdbResult({ tmdbId: 654, genreIds: [28] })])
    );

    const { genres } = await client().discovery.genreSpotlight();
    expect(genres.length).toBeGreaterThan(0);
    expect(genres[0]?.results[0]).toHaveProperty('matchPercentage');
    expect(genres[0]?.totalPages).toBe(5);
  });

  it('returns scored watchlist recommendations from similar movies', async () => {
    const seed = await makeMovie('On Watchlist', { genres: ['Action'] });
    await client().watchlist.add({ mediaType: 'movie', mediaId: seed.id });
    vi.spyOn(tmdb, 'getMovieSimilar').mockResolvedValue(
      tmdbResponse([tmdbResult({ tmdbId: 13579, genreIds: [28] })])
    );

    const res = await client().discovery.watchlistRecommendations();
    expect(res.sourceMovies).toContain('On Watchlist');
    expect(res.results.map((r) => r.tmdbId)).toContain(13579);
    expect(res.results[0]).toHaveProperty('matchPercentage');
  });

  it('stubs trendingPlex to null (Plex Discover client not ported)', async () => {
    const res = await client().discovery.trendingPlex({ limit: 20 });
    expect(res.data).toBeNull();
  });
});

describe('discovery — session assembly + shelf paging', () => {
  async function seedRichLibrary(): Promise<number> {
    const dimId = await firstDimensionId();
    for (let i = 0; i < 6; i++) {
      const a = await makeMovie(`Comfy ${i}`, { genres: ['Action'], voteAverage: 8 });
      const b = await makeMovie(`Other ${i}`, { genres: ['Drama'], voteAverage: 5 });
      await client().comparisons.record({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: a.id,
        mediaBType: 'movie',
        mediaBId: b.id,
        winnerType: 'movie',
        winnerId: a.id,
      });
      // Two watches each so the comfort-picks shelf has rewatched movies.
      await client().watchHistory.log({ mediaType: 'movie', mediaId: a.id, completed: 1 });
      await client().watchHistory.log({
        mediaType: 'movie',
        mediaId: a.id,
        completed: 1,
        watchedAt: new Date(Date.now() - i * 1000).toISOString(),
      });
    }
    return dimId;
  }

  it('assembles shelves with items, records impressions, and excludes dismissed', async () => {
    await seedRichLibrary();
    // Many unwatched movies feed the local "recently added" shelf.
    const unwatchedIds: number[] = [];
    for (let i = 0; i < 8; i++) {
      const m = await makeMovie(`New ${i}`, { genres: ['Action'] });
      unwatchedIds.push(m.tmdbId);
    }
    // TMDB-backed shelves resolve to upstream results.
    vi.spyOn(tmdb, 'getTrendingMovies').mockResolvedValue(
      tmdbResponse(Array.from({ length: 10 }, (_, i) => tmdbResult({ tmdbId: 1000 + i })))
    );
    vi.spyOn(tmdb, 'discoverMovies').mockResolvedValue(
      tmdbResponse(Array.from({ length: 10 }, (_, i) => tmdbResult({ tmdbId: 2000 + i })))
    );
    vi.spyOn(tmdb, 'getMovieRecommendations').mockResolvedValue(
      tmdbResponse(Array.from({ length: 10 }, (_, i) => tmdbResult({ tmdbId: 3000 + i })))
    );
    vi.spyOn(tmdb, 'getMovieSimilar').mockResolvedValue(tmdbResponse([]));
    vi.spyOn(tmdb, 'getMovieCredits').mockResolvedValue({ id: 0, cast: [], crew: [] });
    vi.spyOn(tmdb, 'discoverMoviesByCrew').mockResolvedValue(tmdbResponse([]));
    vi.spyOn(tmdb, 'discoverMoviesByCast').mockResolvedValue(tmdbResponse([]));

    const { shelves } = await client().discovery.assembleSession();
    expect(shelves.length).toBeGreaterThan(0);
    for (const shelf of shelves) {
      expect(shelf.items.length).toBeGreaterThanOrEqual(shelf.pinned ? 1 : 3);
      expect(shelf.shelfId).toBeTruthy();
    }

    // Impressions were recorded for every surfaced shelf.
    const recent = await client().shelfImpressions.recent({ days: 7 });
    const recordedIds = new Set(recent.entries.map((e) => e.shelfId));
    for (const shelf of shelves) {
      expect(recordedIds.has(shelf.shelfId)).toBe(true);
    }
  });

  it('pages a single shelf instance and 404s an unknown shelf', async () => {
    await seedRichLibrary();
    for (let i = 0; i < 8; i++) await makeMovie(`Pageable ${i}`, { genres: ['Action'] });

    const page = await client().discovery.getShelfPage('recently-added', { limit: 3, offset: 0 });
    expect(page.items.length).toBe(3);
    expect(page.hasMore).toBe(true);
    expect(page.totalCount).toBeNull();

    const next = await client().discovery.getShelfPage('recently-added', { limit: 3, offset: 3 });
    expect(next.items.length).toBeGreaterThan(0);
    const firstIds = new Set(page.items.map((i) => i.tmdbId));
    expect(next.items.every((i) => !firstIds.has(i.tmdbId))).toBe(true);

    await expect(
      client().discovery.getShelfPage('no-such-shelf', { limit: 3 })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('discovery — local reads', () => {
  it('suggests rewatches for movies watched 6+ months ago', async () => {
    const old = await makeMovie('Old Favourite', { genres: ['Action'], voteAverage: 9 });
    const recent = await makeMovie('Recent Watch', { genres: ['Action'], voteAverage: 8 });
    const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 60 * 60 * 1000).toISOString();
    await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: old.id,
      completed: 1,
      watchedAt: sevenMonthsAgo,
    });
    await client().watchHistory.log({ mediaType: 'movie', mediaId: recent.id, completed: 1 });

    const { data } = await client().discovery.rewatchSuggestions();
    const ids = data.map((d) => d.tmdbId);
    expect(ids).toContain(old.tmdbId);
    expect(ids).not.toContain(recent.tmdbId);
  });

  it('returns quick-pick movies excluding completed watches', async () => {
    const watched = await makeMovie('Seen It', { genres: ['Action'] });
    const fresh = await makeMovie('Not Seen', { genres: ['Action'] });
    await client().watchHistory.log({ mediaType: 'movie', mediaId: watched.id, completed: 1 });

    const { data } = await client().discovery.quickPick({ count: 10 });
    const ids = data.map((m) => m.tmdbId);
    expect(ids).toContain(fresh.tmdbId);
    expect(ids).not.toContain(watched.tmdbId);
    expect(data[0]).toHaveProperty('posterUrl');
  });
});
