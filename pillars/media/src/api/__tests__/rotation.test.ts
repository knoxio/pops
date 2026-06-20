/**
 * Integration tests for the `rotation.*` REST surface (data plane) via
 * supertest. Upstream HTTP (Radarr / TMDB / Plex) is mocked at
 * `globalThis.fetch` with a route table keyed on (method, url substring), so
 * each test exercises the real client → orchestration → handler → contract
 * path. No network is hit. Source-sync covers the `tmdb_top_rated` adapter
 * against a mocked TMDB discover endpoint; `plex_friends` degradation is
 * covered via an unconfigured Plex.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  moviesService,
  openMediaDb,
  rotationExclusions,
  rotationSourcesService,
  type OpenedMediaDb,
} from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { clearStatusCache } from '../clients/arr/index.js';
import { makeClient } from './test-utils.js';

const RADARR_URL = 'http://radarr.test:7878';

interface RouteResponse {
  status?: number;
  body: unknown;
}

type RouteHandler = (init: { method: string; url: string; body: unknown }) => RouteResponse;

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
  if (!rule) return Promise.resolve(jsonResponse({ error: `unmatched ${method} ${url}` }, 404));
  const res = rule.handler({ method, url, body: parsedBody });
  return Promise.resolve(jsonResponse(res.body, res.status ?? 200));
});

let tmpDir: string;
let mediaDb: OpenedMediaDb;
let tmdbSeq = 700_000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-rotation-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
  routes = [];
  calls = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  clearStatusCache();
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  clearStatusCache();
  delete process.env['RADARR_URL'];
  delete process.env['RADARR_API_KEY'];
  delete process.env['RADARR_QUALITY_PROFILE_ID'];
  delete process.env['RADARR_ROOT_FOLDER_PATH'];
  delete process.env['TMDB_API_KEY'];
  delete process.env['PLEX_URL'];
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

/** A TMDB discover result row with every field the client mapper reads. */
function tmdbResult(id: number, title: string, releaseDate: string, voteAverage: number) {
  return {
    id,
    title,
    original_title: title,
    overview: '',
    release_date: releaseDate,
    poster_path: null,
    backdrop_path: null,
    vote_average: voteAverage,
    vote_count: 1000,
    genre_ids: [],
    original_language: 'en',
    popularity: 1,
  };
}

function enableRadarr(): void {
  process.env['RADARR_URL'] = RADARR_URL;
  process.env['RADARR_API_KEY'] = 'radarr-key';
  process.env['RADARR_QUALITY_PROFILE_ID'] = '4';
  process.env['RADARR_ROOT_FOLDER_PATH'] = '/movies';
}

describe('rotation — candidate queue', () => {
  it('adds a movie, reflects it via status + list, then removes it', async () => {
    const tmdbId = nextTmdb();
    await client().rotation.addToQueue({ tmdbId, title: 'Dune', year: 2021, rating: 8.1 });

    const status = await client().rotation.getCandidateStatus(tmdbId);
    expect(status.data).toMatchObject({
      inQueue: true,
      candidateStatus: 'pending',
      isExcluded: false,
    });
    expect(status.data.candidateId).not.toBeNull();

    const list = await client().rotation.listCandidates({ status: 'pending' });
    expect(list.data.total).toBe(1);
    expect(list.data.items[0]).toMatchObject({
      tmdbId,
      title: 'Dune',
      sourceName: 'Manual Queue',
    });

    const removed = await client().rotation.removeFromQueue(tmdbId);
    expect(removed.data.success).toBe(true);
    expect((await client().rotation.listCandidates({ status: 'pending' })).data.total).toBe(0);
  });

  it('filters list by title search', async () => {
    await client().rotation.addToQueue({ tmdbId: nextTmdb(), title: 'Arrival' });
    await client().rotation.addToQueue({ tmdbId: nextTmdb(), title: 'Sicario' });

    const hit = await client().rotation.listCandidates({ search: 'Arr' });
    expect(hit.data.total).toBe(1);
    expect(hit.data.items[0]?.title).toBe('Arrival');
  });

  it('refuses to queue an excluded movie (409)', async () => {
    const tmdbId = nextTmdb();
    await client().rotation.addExclusion({ tmdbId, reason: 'seen it' });
    await expect(
      client().rotation.addToQueue({ tmdbId, title: 'Excluded Film' })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('rotation — exclusions', () => {
  it('adds, reads, and removes an exclusion; status reflects isExcluded', async () => {
    const tmdbId = nextTmdb();
    await client().rotation.addExclusion({ tmdbId, reason: 'not my taste' });

    const got = await client().rotation.getExclusion(tmdbId);
    expect(got.data).toMatchObject({ tmdbId, reason: 'not my taste' });

    const status = await client().rotation.getCandidateStatus(tmdbId);
    expect(status.data.isExcluded).toBe(true);

    const removed = await client().rotation.removeExclusion(tmdbId);
    expect(removed.data.success).toBe(true);
    expect((await client().rotation.getExclusion(tmdbId)).data).toBeNull();
  });

  it('excluding a queued candidate flips it to excluded; un-excluding resets to pending', async () => {
    const tmdbId = nextTmdb();
    await client().rotation.addToQueue({ tmdbId, title: 'Tenet' });
    await client().rotation.addExclusion({ tmdbId });

    expect((await client().rotation.listCandidates({ status: 'pending' })).data.total).toBe(0);
    expect((await client().rotation.listCandidates({ status: 'excluded' })).data.total).toBe(1);

    await client().rotation.removeExclusion(tmdbId);
    expect((await client().rotation.listCandidates({ status: 'pending' })).data.total).toBe(1);
  });

  it('returns success:false when removing a non-existent exclusion', async () => {
    const res = await client().rotation.removeExclusion(nextTmdb());
    expect(res.data.success).toBe(false);
  });
});

describe('rotation — list exclusions', () => {
  it('returns an empty list with total 0 when none are excluded', async () => {
    const { data } = await client().rotation.listExclusions();
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('lists an exclusion right after it is added', async () => {
    const tmdbId = nextTmdb();
    await client().rotation.addExclusion({ tmdbId, reason: 'meh' });

    const { data } = await client().rotation.listExclusions();
    expect(data.total).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ tmdbId, reason: 'meh', title: String(tmdbId) });
  });

  it('paginates with limit/offset while reporting the full total', async () => {
    const ids = [nextTmdb(), nextTmdb(), nextTmdb(), nextTmdb(), nextTmdb()];
    for (const tmdbId of ids) await client().rotation.addExclusion({ tmdbId });

    const page1 = await client().rotation.listExclusions({ limit: 2, offset: 0 });
    expect(page1.data.total).toBe(5);
    expect(page1.data.items).toHaveLength(2);

    const page2 = await client().rotation.listExclusions({ limit: 2, offset: 2 });
    expect(page2.data.total).toBe(5);
    expect(page2.data.items).toHaveLength(2);

    const page3 = await client().rotation.listExclusions({ limit: 2, offset: 4 });
    expect(page3.data.items).toHaveLength(1);

    const seen = [...page1.data.items, ...page2.data.items, ...page3.data.items].map(
      (e) => e.tmdbId
    );
    expect(seen.toSorted()).toEqual(ids.toSorted());
  });

  it('orders most-recently-excluded first', async () => {
    const older = nextTmdb();
    const newer = nextTmdb();
    await client().rotation.addExclusion({ tmdbId: older });
    await client().rotation.addExclusion({ tmdbId: newer });

    // excludedAt defaults to second-granularity datetime('now'); pin distinct
    // values so the DESC ordering assertion is deterministic rather than a tie.
    mediaDb.db
      .update(rotationExclusions)
      .set({ excludedAt: '2020-01-01 00:00:00' })
      .where(eq(rotationExclusions.tmdbId, older))
      .run();
    mediaDb.db
      .update(rotationExclusions)
      .set({ excludedAt: '2024-01-01 00:00:00' })
      .where(eq(rotationExclusions.tmdbId, newer))
      .run();

    const { data } = await client().rotation.listExclusions();
    expect(data.items.map((e) => e.tmdbId)).toEqual([newer, older]);
  });
});

describe('rotation — download candidate', () => {
  it('adds to Radarr, creates a protected library entry, marks the candidate added', async () => {
    enableRadarr();
    const tmdbId = nextTmdb();
    await client().rotation.addToQueue({ tmdbId, title: 'Interstellar', year: 2014 });
    const candidateId = (await client().rotation.listCandidates({ status: 'pending' })).data
      .items[0]?.id;
    expect(candidateId).toBeDefined();

    route('GET', '/movie?tmdbId', () => ({ body: [] }));
    route('POST', '/api/v3/movie', () => ({
      body: { id: 3, title: 'Interstellar', tmdbId, monitored: true, hasFile: false },
    }));
    // TMDB enrichment is best-effort; leave it unconfigured so it no-ops.

    const res = await client().rotation.downloadCandidate(candidateId as number);
    expect(res.data).toEqual({ success: true, alreadyInRadarr: false });

    const stored = moviesService.getMovieByTmdbId(mediaDb.db, tmdbId);
    expect(stored).not.toBeNull();
    expect(stored?.rotationStatus).toBe('protected');

    const addCall = calls.find((cl) => cl.method === 'POST' && cl.url.includes('/api/v3/movie'));
    expect(addCall?.body).toMatchObject({ qualityProfileId: 4, rootFolderPath: '/movies' });

    expect((await client().rotation.listCandidates({ status: 'added' })).data.total).toBe(1);
  });

  it('skips the Radarr add when the movie already exists but still protects', async () => {
    enableRadarr();
    const tmdbId = nextTmdb();
    moviesService.createMovie(mediaDb.db, { tmdbId, title: 'Already Here' });
    await client().rotation.addToQueue({ tmdbId, title: 'Already Here' });
    const candidateId = (await client().rotation.listCandidates({ status: 'pending' })).data
      .items[0]?.id;

    route('GET', '/movie?tmdbId', () => ({
      body: [{ id: 8, title: 'Already Here', tmdbId, monitored: true, hasFile: true }],
    }));

    const res = await client().rotation.downloadCandidate(candidateId as number);
    expect(res.data.alreadyInRadarr).toBe(true);
    expect(calls.some((cl) => cl.method === 'POST' && cl.url.includes('/api/v3/movie'))).toBe(
      false
    );
    expect(moviesService.getMovieByTmdbId(mediaDb.db, tmdbId)?.rotationStatus).toBe('protected');
  });

  it('404s for a missing candidate, 400 for an already-processed one', async () => {
    enableRadarr();
    await expect(client().rotation.downloadCandidate(99_999)).rejects.toMatchObject({
      status: 404,
    });

    const tmdbId = nextTmdb();
    moviesService.createMovie(mediaDb.db, { tmdbId, title: 'Done' });
    await client().rotation.addToQueue({ tmdbId, title: 'Done' });
    const candidateId = (await client().rotation.listCandidates({ status: 'pending' })).data
      .items[0]?.id as number;
    route('GET', '/movie?tmdbId', () => ({
      body: [{ id: 1, title: 'Done', tmdbId, monitored: true, hasFile: true }],
    }));
    await client().rotation.downloadCandidate(candidateId);

    await expect(client().rotation.downloadCandidate(candidateId)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('409s when Radarr is unconfigured', async () => {
    const tmdbId = nextTmdb();
    await client().rotation.addToQueue({ tmdbId, title: 'No Radarr' });
    const candidateId = (await client().rotation.listCandidates({ status: 'pending' })).data
      .items[0]?.id as number;
    await expect(client().rotation.downloadCandidate(candidateId)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('rotation — sources CRUD + counts', () => {
  it('creates, updates, lists (with counts), and deletes a source', async () => {
    const created = await client().rotation.createSource({
      type: 'tmdb_top_rated',
      name: 'Top Rated',
      priority: 7,
      config: { pages: 2 },
    });
    expect(created.data).toMatchObject({
      type: 'tmdb_top_rated',
      name: 'Top Rated',
      priority: 7,
      enabled: true,
      config: { pages: 2 },
    });

    const updated = await client().rotation.updateSource(created.data.id, {
      name: 'Renamed',
      enabled: false,
    });
    expect(updated.data).toMatchObject({ name: 'Renamed', enabled: false });

    const sources = await client().rotation.listSources();
    const row = sources.data.find((s) => s.id === created.data.id);
    expect(row).toMatchObject({ name: 'Renamed', candidateCount: 0 });

    const removed = await client().rotation.deleteSource(created.data.id);
    expect(removed.data.success).toBe(true);
    expect((await client().rotation.listSources()).data).toHaveLength(0);
  });

  it('listSources reflects candidate counts per source', async () => {
    // The manual source is auto-created by addToQueue.
    await client().rotation.addToQueue({ tmdbId: nextTmdb(), title: 'A' });
    await client().rotation.addToQueue({ tmdbId: nextTmdb(), title: 'B' });

    const sources = await client().rotation.listSources();
    const manual = sources.data.find((s) => s.type === 'manual');
    expect(manual?.candidateCount).toBe(2);
  });

  it('refuses to delete the manual source (409) and 404s unknown ids', async () => {
    await client().rotation.addToQueue({ tmdbId: nextTmdb(), title: 'A' });
    const manual = (await client().rotation.listSources()).data.find((s) => s.type === 'manual');
    await expect(client().rotation.deleteSource(manual?.id as number)).rejects.toMatchObject({
      status: 409,
    });
    await expect(client().rotation.updateSource(99_999, { name: 'x' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('lists registered source adapter types', async () => {
    const { data } = await client().rotation.sourceTypes();
    expect(data.types).toEqual(
      expect.arrayContaining(['tmdb_top_rated', 'plex_watchlist', 'plex_friends', 'letterboxd'])
    );
  });
});

describe('rotation — sync source', () => {
  it('fetches candidates from the tmdb_top_rated adapter and inserts them', async () => {
    process.env['TMDB_API_KEY'] = 'tmdb-key';
    const a = nextTmdb();
    const b = nextTmdb();
    route('GET', '/3/discover/movie', () => ({
      body: {
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [
          tmdbResult(a, 'Movie A', '2001-05-01', 8.5),
          tmdbResult(b, 'Movie B', '2010-01-01', 8.2),
        ],
      },
    }));

    const created = await client().rotation.createSource({
      type: 'tmdb_top_rated',
      name: 'Top Rated',
      config: { pages: 1 },
    });
    const result = await client().rotation.syncSource(created.data.id);
    expect(result.data).toMatchObject({
      sourceType: 'tmdb_top_rated',
      candidatesFetched: 2,
      candidatesInserted: 2,
      candidatesSkipped: 0,
    });

    const list = await client().rotation.listCandidates({ status: 'pending' });
    expect(list.data.total).toBe(2);
    expect(list.data.items.map((i) => i.tmdbId).toSorted()).toEqual([a, b].toSorted());

    // lastSyncedAt is stamped on the synced source.
    const synced = rotationSourcesService.getSource(mediaDb.db, created.data.id);
    expect(synced?.lastSyncedAt).not.toBeNull();
  });

  it('marks fetched candidates that are excluded as excluded on sync', async () => {
    process.env['TMDB_API_KEY'] = 'tmdb-key';
    const excludedId = nextTmdb();
    await client().rotation.addExclusion({ tmdbId: excludedId });
    route('GET', '/3/discover/movie', () => ({
      body: {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [tmdbResult(excludedId, 'Excluded Movie', '2001-01-01', 9)],
      },
    }));

    const created = await client().rotation.createSource({
      type: 'tmdb_top_rated',
      name: 'Top Rated',
      config: { pages: 1 },
    });
    await client().rotation.syncSource(created.data.id);

    expect((await client().rotation.listCandidates({ status: 'pending' })).data.total).toBe(0);
    expect((await client().rotation.listCandidates({ status: 'excluded' })).data.total).toBe(1);
  });

  it('404s when syncing an unknown source', async () => {
    await expect(client().rotation.syncSource(99_999)).rejects.toMatchObject({ status: 404 });
  });

  it('409s when syncing a disabled source', async () => {
    const created = await client().rotation.createSource({
      type: 'tmdb_top_rated',
      name: 'Disabled',
      enabled: false,
    });
    await expect(client().rotation.syncSource(created.data.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('rotation — plex friends', () => {
  it('degrades to an empty list with an error when Plex is unconfigured', async () => {
    const { data } = await client().rotation.listPlexFriends();
    expect(data.friends).toEqual([]);
    expect(data.error).toBe('Plex token not configured');
  });
});

describe('rotation — settings', () => {
  it('returns documented defaults for unset keys', async () => {
    const { data } = await client().rotation.getSettings();
    expect(data).toEqual({
      enabled: '',
      cronExpression: '0 3 * * *',
      targetFreeGb: '100',
      leavingDays: '7',
      dailyAdditions: '2',
      avgMovieGb: '15',
      protectedDays: '30',
    });
  });

  it('save-then-get round-trips the provided keys, leaving the rest at defaults', async () => {
    const saved = await client().rotation.saveSettings({
      cronExpression: '0 5 * * *',
      targetFreeGb: 250,
      enabled: true,
    });
    expect(saved.data).toEqual({ success: true, updated: 3 });

    const { data } = await client().rotation.getSettings();
    expect(data.cronExpression).toBe('0 5 * * *');
    expect(data.targetFreeGb).toBe('250');
    expect(data.enabled).toBe('true');
    expect(data.leavingDays).toBe('7');
  });
});
