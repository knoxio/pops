/**
 * Integration tests for the `search.*` REST surface (TMDB movies + TheTVDB
 * series) via supertest. The upstream HTTP layer is mocked at
 * `globalThis.fetch` with a route table keyed on a URL substring, so the
 * assertions exercise the real client → handler → contract path: raw
 * provider JSON → domain mapping → wire envelope.
 *
 * No database is involved (search is a pure pass-through), but the app
 * factory still needs an opened db handle, so a throwaway one is created.
 *
 * The TheTVDB client is a module-level singleton that caches its JWT; it is
 * reset between tests via `setTvdbClient(null)` so a stubbed login from one
 * test can't leak its token into the next.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { setTvdbClient } from '../clients/thetvdb/index.js';
import { makeClient } from './test-utils.js';

interface RouteResponse {
  status?: number;
  body: unknown;
}

type RouteHandler = () => RouteResponse;

interface RouteRule {
  match: string;
  handler: RouteHandler;
}

let routes: RouteRule[];

function route(match: string, handler: RouteHandler): void {
  routes.push({ match, handler });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn((input: string | URL | Request): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const rule = routes.find((r) => url.includes(r.match));
  if (!rule) return Promise.resolve(jsonResponse({ message: `unmatched ${url}` }, 404));
  const res = rule.handler();
  return Promise.resolve(jsonResponse(res.body, res.status ?? 200));
});

/** TheTVDB requires a JWT — every series search first POSTs to /login. */
function stubTvdbLogin(): void {
  route('/v4/login', () => ({ body: { data: { token: 'test-token' } } }));
}

let tmpDir: string;
let mediaDb: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-search-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
  routes = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  setTvdbClient(null);
  process.env['TMDB_API_KEY'] = 'tmdb-key';
  process.env['THETVDB_API_KEY'] = 'tvdb-key';
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  setTvdbClient(null);
  delete process.env['TMDB_API_KEY'];
  delete process.env['THETVDB_API_KEY'];
});

function client() {
  return makeClient(
    createMediaApiApp({ mediaDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3003' })
  );
}

describe('search — movies (TMDB)', () => {
  it('maps the raw TMDB search response to the wire shape', async () => {
    route('/3/search/movie', () => ({
      body: {
        page: 1,
        total_results: 2,
        total_pages: 1,
        results: [
          {
            id: 603,
            title: 'The Matrix',
            original_title: 'The Matrix',
            overview: 'A hacker learns the truth.',
            release_date: '1999-03-30',
            poster_path: '/poster.jpg',
            backdrop_path: '/backdrop.jpg',
            vote_average: 8.2,
            vote_count: 24000,
            genre_ids: [28, 878],
            original_language: 'en',
            popularity: 99.5,
          },
        ],
      },
    }));

    const res = await client().search.movies({ query: 'matrix' });
    expect(res).toMatchObject({ totalResults: 2, totalPages: 1, page: 1 });
    expect(res.results).toHaveLength(1);
    expect(res.results[0]).toMatchObject({
      tmdbId: 603,
      title: 'The Matrix',
      posterPath: '/poster.jpg',
      voteAverage: 8.2,
    });

    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/3/search/movie'));
    expect(call).toBeDefined();
    expect(String(call?.[0])).toContain('query=matrix');
  });

  it('forwards the page query param to TMDB', async () => {
    route('/3/search/movie', () => ({
      body: { page: 3, total_results: 0, total_pages: 3, results: [] },
    }));

    const res = await client().search.movies({ query: 'dune', page: 3 });
    expect(res.page).toBe(3);
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/3/search/movie'));
    expect(String(call?.[0])).toContain('page=3');
  });

  it('400s an empty query at the contract boundary (no upstream call)', async () => {
    await expect(client().search.movies({ query: '' })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a TMDB upstream failure to 502', async () => {
    route('/3/search/movie', () => ({ body: { status_message: 'Invalid API key' }, status: 401 }));
    await expect(client().search.movies({ query: 'matrix' })).rejects.toMatchObject({
      status: 502,
    });
  });
});

describe('search — tv shows (TheTVDB)', () => {
  it('maps the raw TheTVDB search response to the wire shape', async () => {
    stubTvdbLogin();
    route('/v4/search', () => ({
      body: {
        data: [
          {
            tvdb_id: '121361',
            objectID: 'series-121361',
            name: 'Game of Thrones',
            overview: 'Seven noble families fight.',
            first_air_time: '2011-04-17',
            status: 'Ended',
            image_url: '/got.jpg',
            genres: ['Drama', 'Fantasy'],
            primary_language: 'eng',
            year: '2011',
          },
        ],
      },
    }));

    const res = await client().search.tvShows({ query: 'thrones' });
    expect(res.results).toHaveLength(1);
    expect(res.results[0]).toMatchObject({
      tvdbId: 121361,
      name: 'Game of Thrones',
      year: '2011',
    });

    const searchCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/v4/search'));
    expect(String(searchCall?.[0])).toContain('q=thrones');
    expect(String(searchCall?.[0])).toContain('type=series');
  });

  it('400s an empty query at the contract boundary (no upstream call)', async () => {
    await expect(client().search.tvShows({ query: '' })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a TheTVDB upstream failure to 502', async () => {
    stubTvdbLogin();
    // 5xx (not 429) — surfaces immediately without the rate limiter's backoff.
    route('/v4/search', () => ({ body: { message: 'server error' }, status: 500 }));
    await expect(client().search.tvShows({ query: 'thrones' })).rejects.toMatchObject({
      status: 502,
    });
  });
});
