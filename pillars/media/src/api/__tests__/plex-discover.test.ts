/**
 * Integration tests for the Plex-Discover trending surface
 * (`discovery.trendingPlex` + the `trending-plex` session shelf) via supertest.
 *
 * The Plex Discover provider endpoints are mocked at `globalThis.fetch` with a
 * (method, url-substring) route table, so the assertions exercise the real
 * discover client → service → handler → contract path with no network IO. The
 * vitest suite runs `fileParallelism:false` + `unstubGlobals`, so the fetch
 * stub can't bleed into the DB-only suites.
 *
 * Coverage:
 *  - enriched results: inLibrary / isWatched / onWatchlist flags + poster URL
 *    convention, dismissed + duplicate filtering, TMDB-less items dropped;
 *  - `{ data: null }` when no Plex token is configured;
 *  - the watchlist→hubs fallback when the popularity feed errors;
 *  - assembleSession surfaces the shelf when Plex is connected and omits it
 *    (gracefully, no throw) when Plex is not connected.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, plexSettingsService, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { TmdbClient } from '../clients/tmdb/client.js';
import { makeClient } from './test-utils.js';

const { getTmdbClientMock } = vi.hoisted(() => ({ getTmdbClientMock: vi.fn<() => TmdbClient>() }));

vi.mock('../clients/tmdb/index.js', async () => {
  const actual = await vi.importActual<typeof import('../clients/tmdb/index.js')>(
    '../clients/tmdb/index.js'
  );
  return { ...actual, getTmdbClient: getTmdbClientMock };
});

interface RouteResponse {
  status?: number;
  body: unknown;
}
type RouteHandler = () => RouteResponse;
interface RouteRule {
  method: string;
  match: string;
  handler: RouteHandler;
}

let routes: RouteRule[];
let calls: { method: string; url: string }[];

function route(method: string, match: string, handler: RouteHandler): void {
  routes.push({ method, match, handler });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  calls.push({ method, url });
  const rule = routes.find((r) => r.method === method && url.includes(r.match));
  if (!rule) return Promise.resolve(jsonResponse({ error: `unmatched ${method} ${url}` }, 404));
  const res = rule.handler();
  return Promise.resolve(jsonResponse(res.body, res.status ?? 200));
});

interface PlexDiscoverItem {
  ratingKey: string;
  type: string;
  title: string;
  year?: number;
  summary?: string;
  thumb?: string;
  audienceRating?: number;
  addedAt: number;
  updatedAt: number;
  Guid?: { id: string }[];
}

function discoverItem(
  tmdbId: number | null,
  overrides: Partial<PlexDiscoverItem> = {}
): PlexDiscoverItem {
  return {
    ratingKey: `rk-${tmdbId ?? 'none'}`,
    type: 'movie',
    title: `Movie ${tmdbId ?? 'no-tmdb'}`,
    year: 2021,
    summary: 'plex summary',
    thumb: 'https://plex.cdn/poster.jpg',
    audienceRating: 8.4,
    addedAt: 1700000000,
    updatedAt: 1700000001,
    Guid: tmdbId === null ? [] : [{ id: `tmdb://${tmdbId}` }],
    ...overrides,
  };
}

function stubWatchlistTrending(items: PlexDiscoverItem[]): void {
  route('GET', 'discover.provider.plex.tv/library/sections/watchlist/all', () => ({
    body: { MediaContainer: { Metadata: items } },
  }));
}

let tmpDir: string;
let mediaDb: OpenedMediaDb;
let tmdb: TmdbClient;
let idSeq = 9000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-plex-discover-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
  tmdb = new TmdbClient('test-key');
  getTmdbClientMock.mockReturnValue(tmdb);
  routes = [];
  calls = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env['PLEX_URL'];
  delete process.env['ENCRYPTION_KEY'];
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete process.env['PLEX_URL'];
  delete process.env['ENCRYPTION_KEY'];
});

function client() {
  return makeClient(
    createMediaApiApp({ mediaDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3003' })
  );
}

function seedToken(): void {
  plexSettingsService.setSetting(mediaDb.db, 'plex_token', 'raw-discover-token');
}

function nextId(): number {
  idSeq += 1;
  return idSeq;
}

async function makeMovie(title: string, tmdbId: number) {
  return (await client().movies.create({ tmdbId, title })).data;
}

describe('discovery.trendingPlex — enrichment', () => {
  it('returns enriched trending movies with library/watched/watchlist flags + poster URL', async () => {
    const libMovie = await makeMovie('In Library', nextId());
    const watchedMovie = await makeMovie('Watched', nextId());
    const watchlistMovie = await makeMovie('On Watchlist', nextId());
    await client().watchHistory.log({ mediaType: 'movie', mediaId: watchedMovie.id, completed: 1 });
    await client().watchlist.add({ mediaType: 'movie', mediaId: watchlistMovie.id });

    const freshId = 654321;
    seedToken();
    stubWatchlistTrending([
      discoverItem(libMovie.tmdbId, { title: 'In Library' }),
      discoverItem(watchedMovie.tmdbId, { title: 'Watched' }),
      discoverItem(watchlistMovie.tmdbId, { title: 'On Watchlist' }),
      discoverItem(freshId, { title: 'Fresh', thumb: 'https://plex.cdn/fresh.jpg' }),
    ]);

    const { data } = await client().discovery.trendingPlex({ limit: 20 });
    expect(data).not.toBeNull();
    const byId = new Map((data ?? []).map((r) => [r.tmdbId, r]));

    expect(byId.get(libMovie.tmdbId)?.inLibrary).toBe(true);
    expect(byId.get(libMovie.tmdbId)?.posterUrl).toBe(
      `/media/images/movie/${libMovie.tmdbId}/poster.jpg`
    );
    expect(byId.get(watchedMovie.tmdbId)?.isWatched).toBe(true);
    expect(byId.get(watchlistMovie.tmdbId)?.onWatchlist).toBe(true);

    const fresh = byId.get(freshId);
    expect(fresh?.inLibrary).toBe(false);
    expect(fresh?.isWatched).toBe(false);
    expect(fresh?.onWatchlist).toBe(false);
    // Non-library items keep the Plex CDN thumb, not the local proxy URL.
    expect(fresh?.posterUrl).toBe('https://plex.cdn/fresh.jpg');
    expect(fresh?.voteAverage).toBe(8.4);
    expect(fresh?.releaseDate).toBe('2021-01-01');

    // Discover provider was actually hit (no live network).
    expect(
      calls.some(
        (c) => c.url.includes('discover.provider.plex.tv') && c.url.includes('raw-discover-token')
      )
    ).toBe(true);
  });

  it('drops dismissed, duplicate, and TMDB-less items', async () => {
    const dismissedId = 111;
    await client().discovery.dismiss(dismissedId);
    seedToken();
    stubWatchlistTrending([
      discoverItem(dismissedId, { title: 'Dismissed' }),
      discoverItem(222, { title: 'Keep' }),
      discoverItem(222, { ratingKey: 'rk-dup', title: 'Duplicate' }),
      discoverItem(null, { title: 'No TMDB id' }),
    ]);

    const { data } = await client().discovery.trendingPlex();
    const ids = (data ?? []).map((r) => r.tmdbId);
    expect(ids).toEqual([222]);
  });

  it('falls back to the promoted hubs when the watchlist feed errors', async () => {
    seedToken();
    route('GET', 'discover.provider.plex.tv/library/sections/watchlist/all', () => ({
      status: 500,
      body: { error: 'boom' },
    }));
    route('GET', 'discover.provider.plex.tv/hubs/promoted', () => ({
      body: {
        MediaContainer: {
          Hub: [
            {
              type: 'movie',
              Metadata: [discoverItem(777, { title: 'From Hub' }), discoverItem(null)],
            },
          ],
        },
      },
    }));

    const { data } = await client().discovery.trendingPlex();
    expect((data ?? []).map((r) => r.tmdbId)).toEqual([777]);
    expect(calls.some((c) => c.url.includes('/hubs/promoted'))).toBe(true);
  });

  it('returns null when no Plex token is configured', async () => {
    const { data } = await client().discovery.trendingPlex({ limit: 20 });
    expect(data).toBeNull();
    // No token → no discover call.
    expect(calls.some((c) => c.url.includes('discover.provider.plex.tv'))).toBe(false);
  });
});

describe('discovery — session assembly with the trending-plex shelf', () => {
  async function seedRichLibrary(): Promise<void> {
    const dims = await client().comparisons.listDimensions();
    const dimId = dims.data[0]?.id;
    if (dimId === undefined) throw new Error('expected a seeded dimension');
    for (let i = 0; i < 6; i++) {
      const a = (
        await client().movies.create({
          tmdbId: nextId(),
          title: `Comfy ${i}`,
          genres: ['Action'],
          voteAverage: 8,
        })
      ).data;
      const b = (
        await client().movies.create({
          tmdbId: nextId(),
          title: `Other ${i}`,
          genres: ['Drama'],
          voteAverage: 5,
        })
      ).data;
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
      await client().watchHistory.log({
        mediaType: 'movie',
        mediaId: a.id,
        completed: 1,
        watchedAt: new Date(Date.now() - i * 1000).toISOString(),
      });
    }
    for (let i = 0; i < 8; i++) {
      await client().movies.create({ tmdbId: nextId(), title: `New ${i}`, genres: ['Action'] });
    }
  }

  function stubTmdbShelves(): void {
    vi.spyOn(tmdb, 'getTrendingMovies').mockResolvedValue({
      results: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });
    vi.spyOn(tmdb, 'discoverMovies').mockResolvedValue({
      results: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });
    vi.spyOn(tmdb, 'getMovieRecommendations').mockResolvedValue({
      results: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });
    vi.spyOn(tmdb, 'getMovieSimilar').mockResolvedValue({
      results: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });
    vi.spyOn(tmdb, 'getMovieCredits').mockResolvedValue({ id: 0, cast: [], crew: [] });
    vi.spyOn(tmdb, 'discoverMoviesByCrew').mockResolvedValue({
      results: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });
    vi.spyOn(tmdb, 'discoverMoviesByCast').mockResolvedValue({
      results: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });
  }

  it('registers + pages the trending-plex shelf when Plex is connected', async () => {
    // Session selection is randomised + capped, so a specific shelf is not
    // guaranteed to surface in a given session. The deterministic proof that
    // the shelf is registered + wired is paging it directly by id.
    await seedRichLibrary();
    seedToken();
    stubWatchlistTrending(
      Array.from({ length: 10 }, (_, i) => discoverItem(500000 + i, { title: `Plex Trend ${i}` }))
    );

    const page = await client().discovery.getShelfPage('trending-plex', { limit: 5, offset: 0 });
    expect(page.items.length).toBe(5);
    expect(page.items.every((i) => !i.inLibrary)).toBe(true);
    expect(page.items[0]?.posterUrl).toBe('https://plex.cdn/poster.jpg');

    const next = await client().discovery.getShelfPage('trending-plex', { limit: 5, offset: 5 });
    const firstIds = new Set(page.items.map((i) => i.tmdbId));
    expect(next.items.every((i) => !firstIds.has(i.tmdbId))).toBe(true);
  });

  it('yields an empty trending-plex page (no throw) and assembles a session when Plex is off', async () => {
    await seedRichLibrary();
    stubTmdbShelves();
    // No token seeded → getTrendingFromPlex returns null → shelf yields [].

    const page = await client().discovery.getShelfPage('trending-plex', { limit: 5, offset: 0 });
    expect(page.items).toEqual([]);

    // Session assembly still works and never surfaces an empty external shelf.
    const { shelves } = await client().discovery.assembleSession();
    expect(shelves.length).toBeGreaterThan(0);
    expect(shelves.find((s) => s.shelfId === 'trending-plex')).toBeUndefined();
    // The Plex Discover endpoint was never called (no token short-circuits it).
    expect(calls.some((c) => c.url.includes('discover.provider.plex.tv'))).toBe(false);
  });
});
