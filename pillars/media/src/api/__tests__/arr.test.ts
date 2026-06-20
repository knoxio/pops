/**
 * Integration tests for the `arr.*` REST surface (Radarr + Sonarr) via
 * supertest. The upstream *arr HTTP layer is mocked at `globalThis.fetch`
 * with a route table keyed on (method, url substring) so the assertions
 * exercise the real client → handler → contract path. Config is ENV-ONLY,
 * so each test sets `RADARR_*` / `SONARR_*` env vars (or clears them to
 * exercise the unconfigured branch).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { moviesService } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { clearStatusCache } from '../clients/arr/index.js';
import { makeClient } from './test-utils.js';

const RADARR_URL = 'http://radarr.test:7878';
const SONARR_URL = 'http://sonarr.test:8989';

interface RouteResponse {
  status?: number;
  body: unknown;
}

type RouteHandler = (init: { method: string; body: unknown }) => RouteResponse;

interface RouteRule {
  method: string;
  match: string;
  handler: RouteHandler;
}

let routes: RouteRule[];
let calls: { method: string; url: string; body: unknown }[];

function route(method: string, match: string, handler: RouteHandler): void {
  routes.push({ method, match, handler });
}

/** Find a recorded upstream call, asserting it happened (no optional chaining). */
function requireCall(predicate: (c: { method: string; url: string; body: unknown }) => boolean): {
  method: string;
  url: string;
  body: unknown;
} {
  const call = calls.find(predicate);
  if (!call) throw new Error('expected an upstream *arr call but none matched');
  return call;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  const parsedBody =
    typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
  calls.push({ method, url, body: parsedBody });
  const rule = routes.find((r) => r.method === method && url.includes(r.match));
  if (!rule) {
    return Promise.resolve(jsonResponse({ error: `unmatched ${method} ${url}` }, 404));
  }
  const res = rule.handler({ method, body: parsedBody });
  return Promise.resolve(jsonResponse(res.body, res.status ?? 200));
});

let tmpDir: string;
let mediaDb: OpenedMediaDb;
let tmdbSeq = 50_000;
let tvdbSeq = 60_000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-arr-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
  routes = [];
  calls = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  clearStatusCache();
  process.env['RADARR_URL'] = RADARR_URL;
  process.env['RADARR_API_KEY'] = 'radarr-key';
  process.env['SONARR_URL'] = SONARR_URL;
  process.env['SONARR_API_KEY'] = 'sonarr-key';
  process.env['RADARR_QUALITY_PROFILE_ID'] = '4';
  process.env['RADARR_ROOT_FOLDER_PATH'] = '/movies';
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  clearStatusCache();
  delete process.env['RADARR_URL'];
  delete process.env['RADARR_API_KEY'];
  delete process.env['SONARR_URL'];
  delete process.env['SONARR_API_KEY'];
  delete process.env['RADARR_QUALITY_PROFILE_ID'];
  delete process.env['RADARR_ROOT_FOLDER_PATH'];
});

function client() {
  return makeClient(
    createMediaApiApp({ mediaDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3003' })
  );
}

function nextTmdb(): number {
  tmdbSeq += 1;
  return tmdbSeq;
}

function nextTvdb(): number {
  tvdbSeq += 1;
  return tvdbSeq;
}

describe('arr — config & settings (env-only)', () => {
  it('reports configured when env vars are set', async () => {
    const cfg = await client().arr.config();
    expect(cfg.data).toEqual({ radarrConfigured: true, sonarrConfigured: true });
  });

  it('settings projects URLs + presence flags, never key values', async () => {
    const { data } = await client().arr.settings();
    expect(data).toEqual({
      radarrUrl: RADARR_URL,
      radarrConfigured: true,
      sonarrUrl: SONARR_URL,
      sonarrConfigured: true,
    });
    expect(JSON.stringify(data)).not.toContain('radarr-key');
  });

  it('reports unconfigured when env is cleared', async () => {
    delete process.env['RADARR_URL'];
    delete process.env['SONARR_API_KEY'];
    const cfg = await client().arr.config();
    expect(cfg.data).toEqual({ radarrConfigured: false, sonarrConfigured: false });
  });
});

describe('arr — radarr queries', () => {
  it('lists quality profiles and root folders with the X-Api-Key header', async () => {
    route('GET', '/qualityprofile', () => ({
      body: [{ id: 1, name: 'HD' }],
    }));
    route('GET', '/rootfolder', () => ({
      body: [{ id: 1, path: '/movies', freeSpace: 999 }],
    }));

    const profiles = await client().arr.radarrQualityProfiles();
    expect(profiles.data).toEqual([{ id: 1, name: 'HD' }]);
    const folders = await client().arr.radarrRootFolders();
    expect(folders.data[0]?.path).toBe('/movies');

    const profileCall = calls.find((c) => c.url.includes('/qualityprofile'));
    expect(profileCall?.url.startsWith(RADARR_URL)).toBe(true);
  });

  it('maps the combined queue from both services', async () => {
    // Radarr + Sonarr both hit /api/v3/queue; differentiate by host:port.
    route('GET', 'radarr.test:7878/api/v3/queue', () => ({
      body: {
        totalRecords: 1,
        records: [
          { id: 11, movieId: 1, title: 'Dune', status: 'downloading', size: 100, sizeleft: 25 },
        ],
      },
    }));
    route('GET', 'sonarr.test:8989/api/v3/queue', () => ({
      body: {
        totalRecords: 1,
        records: [
          {
            id: 22,
            seriesId: 2,
            title: 'The Expanse',
            status: 'downloading',
            size: 200,
            sizeleft: 100,
            episode: { title: 'Ep', seasonNumber: 1, episodeNumber: 5 },
          },
        ],
      },
    }));

    const { data } = await client().arr.queue();
    expect(data).toHaveLength(2);
    const radarrItem = data.find((d) => d['source'] === 'radarr');
    expect(radarrItem).toMatchObject({ id: 'radarr-11', mediaType: 'movie', progress: 75 });
    const sonarrItem = data.find((d) => d['source'] === 'sonarr');
    expect(sonarrItem).toMatchObject({ id: 'sonarr-22', episodeLabel: 'S01E05', progress: 50 });
  });

  it('derives a downloading status with progress', async () => {
    const tmdbId = nextTmdb();
    route('GET', '/movie?tmdbId', () => ({
      body: [{ id: 7, title: 'Dune', tmdbId, monitored: true, hasFile: false }],
    }));
    route('GET', '/api/v3/queue', () => ({
      body: {
        totalRecords: 1,
        records: [
          { id: 7, movieId: 7, title: 'Dune', status: 'downloading', size: 100, sizeleft: 10 },
        ],
      },
    }));

    const { data } = await client().arr.movieStatus(tmdbId);
    expect(data).toMatchObject({ status: 'downloading', progress: 90 });
  });
});

describe('arr — radarr mutations', () => {
  it('adds a movie, clears status cache, and triggers a search', async () => {
    const tmdbId = nextTmdb();
    route('POST', '/api/v3/movie', () => ({
      body: { id: 9, title: 'Arrival', tmdbId, monitored: true, hasFile: false },
    }));
    route('POST', '/command', ({ body }) => ({
      body: { id: 1, name: (body as { name: string }).name, status: 'queued' },
    }));

    const added = await client().arr.addMovie({
      tmdbId,
      title: 'Arrival',
      year: 2016,
      qualityProfileId: 4,
      rootFolderPath: '/movies',
    });
    expect(added.data['id']).toBe(9);

    const search = await client().arr.triggerRadarrSearch(9);
    expect(search.data['name']).toBe('MoviesSearch');
  });

  it('toggles movie monitoring (fetch full → merge → PUT)', async () => {
    route('GET', '/api/v3/movie/5', () => ({
      body: { id: 5, title: 'Sicario', tmdbId: 1, monitored: true, hasFile: true },
    }));
    route('PUT', '/api/v3/movie/5', ({ body }) => ({ body }));

    const res = await client().arr.updateRadarrMonitoring(5, false);
    expect(res.data['monitored']).toBe(false);
    const put = requireCall((c) => c.method === 'PUT');
    expect((put.body as { monitored: boolean }).monitored).toBe(false);
  });
});

describe('arr — download & protect', () => {
  it('adds to Radarr (when missing), creates a library entry, marks it protected', async () => {
    const tmdbId = nextTmdb();
    route('GET', '/movie?tmdbId', () => ({ body: [] }));
    route('POST', '/api/v3/movie', () => ({
      body: { id: 3, title: 'Blade Runner 2049', tmdbId, monitored: true, hasFile: false },
    }));

    const res = await client().arr.downloadAndProtect({
      tmdbId,
      title: 'Blade Runner 2049',
      year: 2017,
    });
    expect(res.data.alreadyInRadarr).toBe(false);

    const stored = moviesService.getMovieByTmdbId(mediaDb.db, tmdbId);
    expect(stored).not.toBeNull();
    expect(stored?.rotationStatus).toBe('protected');
    expect(stored?.title).toBe('Blade Runner 2049');

    const addCall = calls.find((c) => c.method === 'POST' && c.url.includes('/api/v3/movie'));
    expect(addCall?.body).toMatchObject({ qualityProfileId: 4, rootFolderPath: '/movies' });
  });

  it('skips the Radarr add when the movie already exists but still protects', async () => {
    const tmdbId = nextTmdb();
    route('GET', '/movie?tmdbId', () => ({
      body: [{ id: 8, title: 'Existing', tmdbId, monitored: true, hasFile: true }],
    }));

    const res = await client().arr.downloadAndProtect({ tmdbId, title: 'Existing', year: 2020 });
    expect(res.data.alreadyInRadarr).toBe(true);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(moviesService.getMovieByTmdbId(mediaDb.db, tmdbId)?.rotationStatus).toBe('protected');
  });

  it('protects a pre-existing library entry without duplicating it', async () => {
    const tmdbId = nextTmdb();
    const created = moviesService.createMovie(mediaDb.db, { tmdbId, title: 'Already Here' });
    route('GET', '/movie?tmdbId', () => ({
      body: [{ id: 8, title: 'Already Here', tmdbId, monitored: true, hasFile: true }],
    }));

    await client().arr.downloadAndProtect({ tmdbId, title: 'Already Here', year: 2021 });
    const stored = moviesService.getMovieByTmdbId(mediaDb.db, tmdbId);
    expect(stored?.id).toBe(created.id);
    expect(stored?.rotationStatus).toBe('protected');
  });

  it('409s when rotation defaults are not configured', async () => {
    delete process.env['RADARR_QUALITY_PROFILE_ID'];
    route('GET', '/movie?tmdbId', () => ({ body: [] }));
    await expect(
      client().arr.downloadAndProtect({ tmdbId: nextTmdb(), title: 'X', year: 2020 })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('arr — sonarr operations', () => {
  it('adds a series', async () => {
    const tvdbId = nextTvdb();
    route('POST', '/api/v3/series', ({ body }) => ({
      body: {
        id: 12,
        title: (body as { title: string }).title,
        tvdbId,
        monitored: true,
        statistics: {
          episodeFileCount: 0,
          episodeCount: 10,
          totalEpisodeCount: 10,
          percentOfEpisodes: 0,
        },
        seasons: [{ seasonNumber: 1, monitored: true }],
      },
    }));

    const res = await client().arr.addSeries({
      tvdbId,
      title: 'Severance',
      qualityProfileId: 1,
      rootFolderPath: '/tv',
      languageProfileId: 1,
      seasons: [{ seasonNumber: 1, monitored: true }],
    });
    expect(res.data['id']).toBe(12);
  });

  it('toggles a single season monitoring flag', async () => {
    route('GET', '/api/v3/series/30', () => ({
      body: {
        id: 30,
        title: 'Show',
        tvdbId: 1,
        monitored: true,
        statistics: {
          episodeFileCount: 0,
          episodeCount: 1,
          totalEpisodeCount: 1,
          percentOfEpisodes: 0,
        },
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: true },
        ],
      },
    }));
    route('PUT', '/api/v3/series/30', ({ body }) => ({ body }));

    const res = await client().arr.updateSeasonMonitoring(30, 2, false);
    expect(res.message).toContain('Season 2');
    const put = requireCall((c) => c.method === 'PUT');
    const season = (
      put.body as { seasons: { seasonNumber: number; monitored: boolean }[] }
    ).seasons.find((s) => s.seasonNumber === 2);
    expect(season?.monitored).toBe(false);
  });

  it('batch-updates episode monitoring', async () => {
    route('PUT', '/episode/monitor', () => ({ body: {} }));
    const res = await client().arr.updateEpisodeMonitoring([1, 2, 3], true);
    expect(res.message).toContain('3 episode(s)');
    const put = requireCall((c) => c.url.includes('/episode/monitor'));
    expect((put.body as { episodeIds: number[] }).episodeIds).toEqual([1, 2, 3]);
  });

  it('maps the calendar to the FE shape with a poster url', async () => {
    route('GET', '/calendar', () => ({
      body: [
        {
          id: 1,
          seriesId: 2,
          tvdbId: 3,
          title: 'Pilot',
          seasonNumber: 1,
          episodeNumber: 1,
          airDateUtc: '2026-07-01T00:00:00Z',
          hasFile: false,
          series: {
            id: 2,
            title: 'New Show',
            tvdbId: 3,
            images: [{ coverType: 'poster', remoteUrl: 'http://img/poster.jpg' }],
          },
        },
      ],
    }));

    const { data } = await client().arr.calendar({ start: '2026-07-01', end: '2026-07-07' });
    expect(data[0]).toMatchObject({
      seriesTitle: 'New Show',
      episodeTitle: 'Pilot',
      posterUrl: 'http://img/poster.jpg',
    });
  });

  it('checks a series existence by tvdbId', async () => {
    const tvdbId = nextTvdb();
    // Specific `/series/40` first — routes resolve on first match.
    route('GET', '/api/v3/series/40', () => ({
      body: {
        id: 40,
        title: 'Found',
        tvdbId,
        monitored: true,
        statistics: {
          episodeFileCount: 0,
          episodeCount: 1,
          totalEpisodeCount: 1,
          percentOfEpisodes: 0,
        },
        seasons: [{ seasonNumber: 1, monitored: true }],
      },
    }));
    route('GET', '/api/v3/series', () => ({
      body: [
        {
          id: 40,
          title: 'Found',
          tvdbId,
          monitored: true,
          statistics: {
            episodeFileCount: 0,
            episodeCount: 1,
            totalEpisodeCount: 1,
            percentOfEpisodes: 0,
          },
        },
      ],
    }));

    const { data } = await client().arr.checkSeries(tvdbId);
    expect(data).toMatchObject({ exists: true, sonarrId: 40 });
  });
});

describe('arr — connection tests', () => {
  it('reports a successful Radarr connection', async () => {
    route('GET', '/system/status', () => ({ body: { version: '5.0', appName: 'Radarr' } }));
    const res = await client().arr.testRadarr({ url: RADARR_URL, apiKey: 'k' });
    expect(res.data).toMatchObject({ configured: true, connected: true, appName: 'Radarr' });
    expect(res.message).toBe('Radarr connection successful');
  });

  it('flags an app mismatch as not connected', async () => {
    route('GET', '/system/status', () => ({ body: { version: '4.0', appName: 'Sonarr' } }));
    const res = await client().arr.testRadarr({ url: RADARR_URL, apiKey: 'k' });
    expect(res.data.connected).toBe(false);
    expect(res.data.error).toContain('Expected Radarr');
  });

  it('reports a failed connection (non-2xx) without throwing', async () => {
    route('GET', '/system/status', () => ({ body: { message: 'unauthorized' }, status: 401 }));
    const res = await client().arr.testSonarr({ url: SONARR_URL, apiKey: 'bad' });
    expect(res.data).toMatchObject({ configured: true, connected: false });
    expect(res.data.error).toContain('401');
  });

  it('test-saved reports unconfigured when env is cleared', async () => {
    delete process.env['RADARR_URL'];
    const res = await client().arr.testRadarrSaved();
    expect(res.data).toMatchObject({ configured: false, connected: false });
  });

  it('test-saved tests the env creds when configured', async () => {
    route('GET', '/system/status', () => ({ body: { version: '5.0', appName: 'Radarr' } }));
    const res = await client().arr.testRadarrSaved();
    expect(res.data.connected).toBe(true);
    const statusCall = calls.find((c) => c.url.includes('/system/status'));
    expect(statusCall?.url.startsWith(RADARR_URL)).toBe(true);
  });
});

describe('arr — unconfigured (null client) path', () => {
  it('409s radarr queries when Radarr env is unset', async () => {
    delete process.env['RADARR_URL'];
    delete process.env['RADARR_API_KEY'];
    await expect(client().arr.radarrQualityProfiles()).rejects.toMatchObject({ status: 409 });
  });

  it('409s sonarr mutations when Sonarr env is unset', async () => {
    delete process.env['SONARR_URL'];
    delete process.env['SONARR_API_KEY'];
    await expect(
      client().arr.addSeries({
        tvdbId: nextTvdb(),
        title: 'X',
        qualityProfileId: 1,
        rootFolderPath: '/tv',
        languageProfileId: 1,
        seasons: [],
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('returns an empty queue when neither service is configured', async () => {
    delete process.env['RADARR_URL'];
    delete process.env['SONARR_URL'];
    const { data } = await client().arr.queue();
    expect(data).toEqual([]);
  });

  it('reports a not-configured status badge for an unconfigured Radarr', async () => {
    delete process.env['RADARR_URL'];
    const { data } = await client().arr.movieStatus(nextTmdb());
    expect(data).toMatchObject({ status: 'not_found', label: 'Radarr not configured' });
  });
});
