/**
 * Tests for the singleton rotation-scheduler controller + the `rotation.*`
 * scheduler REST surface (slice 11b).
 *
 * `runOnce` is exercised DIRECTLY (no real timer): upstream Radarr HTTP is
 * mocked at `globalThis.fetch` with a (method, url-substring) route table, so
 * the real client → cycle → log path runs end-to-end. The recursive arm timer
 * is only touched in the toggle tests, driven with `vi.useFakeTimers()` and
 * restored in `afterEach`; `rotationScheduler._reset()` clears the module-level
 * singleton after every test so no timer leaks between cases.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  moviesService,
  openMediaDb,
  rotationCandidatesService,
  rotationLogService,
  rotationRemovalQueries,
  rotationSettingsService,
  type OpenedMediaDb,
} from '../../../db/index.js';
import { makeClient } from '../../__tests__/test-utils.js';
import { createMediaApiApp } from '../../app.js';
import { clearStatusCache } from '../../clients/arr/index.js';
import { rotationScheduler } from '../rotation-scheduler.js';

import type { Express } from 'express';

const RADARR_URL = 'http://radarr.test:7878';
const GB = 1_073_741_824;

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
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
  calls.push({ method, url, body });
  const rule = routes.find((r) => r.method === method && url.includes(r.match));
  if (!rule) return Promise.resolve(jsonResponse({ error: `unmatched ${method} ${url}` }, 404));
  const res = rule.handler({ method, url, body });
  return Promise.resolve(jsonResponse(res.body, res.status ?? 200));
});

let tmpDir: string;
let opened: OpenedMediaDb;

function app(): Express {
  return createMediaApiApp({ mediaDb: opened, version: '0.0.1-test', selfBaseUrl: RADARR_URL });
}

function enableRadarr(): void {
  process.env['RADARR_URL'] = RADARR_URL;
  process.env['RADARR_API_KEY'] = 'radarr-key';
  process.env['RADARR_QUALITY_PROFILE_ID'] = '4';
  process.env['RADARR_ROOT_FOLDER_PATH'] = '/movies';
}

/** Radarr /diskspace responding with `freeGb` free on the first disk. */
function routeDiskSpace(freeGb: number, totalGb = 1000): void {
  route('GET', '/diskspace', () => ({
    body: [{ path: '/movies', label: 'media', freeSpace: freeGb * GB, totalSpace: totalGb * GB }],
  }));
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-rotation-sched-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
  routes = [];
  calls = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  clearStatusCache();
});

afterEach(() => {
  rotationScheduler._reset();
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  clearStatusCache();
  delete process.env['RADARR_URL'];
  delete process.env['RADARR_API_KEY'];
  delete process.env['RADARR_QUALITY_PROFILE_ID'];
  delete process.env['RADARR_ROOT_FOLDER_PATH'];
  delete process.env['TMDB_API_KEY'];
  vi.clearAllMocks();
});

describe('rotationScheduler.runOnce — cycle', () => {
  it('marks the oldest eligible movie leaving when disk is below target', async () => {
    enableRadarr();
    rotationSettingsService.setMany(opened.db, [
      { key: 'rotation_target_free_gb', value: '100' },
      { key: 'rotation_leaving_days', value: '7' },
      { key: 'rotation_daily_additions', value: '0' },
    ]);
    const older = moviesService.createMovie(opened.db, { tmdbId: 11, title: 'Old One' });
    const newer = moviesService.createMovie(opened.db, { tmdbId: 22, title: 'New One' });
    opened.raw.exec(`UPDATE movies SET created_at='2020-01-01' WHERE id=${older.id}`);
    opened.raw.exec(`UPDATE movies SET created_at='2024-01-01' WHERE id=${newer.id}`);

    // Free space (50) well below target (100); both movies are 30 GB on disk.
    routeDiskSpace(50);
    route('GET', '/movie?tmdbId', () => ({ body: [] }));
    route('GET', '/queue', () => ({ body: { totalRecords: 0, records: [] } }));
    route('GET', '/movie', () => ({
      body: [
        {
          id: 1,
          title: 'Old One',
          tmdbId: 11,
          monitored: true,
          hasFile: true,
          sizeOnDisk: 30 * GB,
        },
        {
          id: 2,
          title: 'New One',
          tmdbId: 22,
          monitored: true,
          hasFile: true,
          sizeOnDisk: 30 * GB,
        },
      ],
    }));

    await rotationScheduler.runOnce(opened.db);

    const leaving = rotationRemovalQueries.getLeavingMovies(opened.db);
    // Deficit = 100 - 50 = 50 GB; oldest (30 GB) alone is < 50, so both eligible
    // get marked until the cumulative size covers the deficit.
    expect(leaving.map((m) => m.tmdbId)).toEqual([11, 22]);

    const log = rotationLogService.lastCycleLog(opened.db);
    expect(log?.moviesMarkedLeaving).toBe(2);
    expect(log?.skippedReason).toBeNull();
  });

  it('expires + deletes a leaving movie from Radarr once its window elapsed', async () => {
    enableRadarr();
    rotationSettingsService.setMany(opened.db, [
      { key: 'rotation_target_free_gb', value: '0' },
      { key: 'rotation_daily_additions', value: '0' },
    ]);
    const movie = moviesService.createMovie(opened.db, { tmdbId: 77, title: 'Expired' });
    rotationRemovalQueries.markMoviesAsLeaving(opened.db, [movie.id], '2020-01-01T00:00:00.000Z');

    routeDiskSpace(500);
    route('GET', '/movie?tmdbId', () => ({
      body: [{ id: 9, title: 'Expired', tmdbId: 77, monitored: true, hasFile: true }],
    }));
    route('GET', '/queue', () => ({ body: { totalRecords: 0, records: [] } }));
    route('GET', '/movie', () => ({ body: [] }));
    let deleted = false;
    route('DELETE', '/movie/9', () => {
      deleted = true;
      return { body: {} };
    });

    await rotationScheduler.runOnce(opened.db);

    expect(deleted).toBe(true);
    expect(moviesService.getMovieByTmdbId(opened.db, 77)?.rotationStatus).toBeNull();
    expect(rotationLogService.lastCycleLog(opened.db)?.moviesRemoved).toBe(1);
  });

  it('downloads up to the daily cap when disk is above target', async () => {
    enableRadarr();
    rotationSettingsService.setMany(opened.db, [
      { key: 'rotation_target_free_gb', value: '100' },
      { key: 'rotation_daily_additions', value: '2' },
      { key: 'rotation_avg_movie_gb', value: '10' },
    ]);
    rotationCandidatesService.addToQueue(opened.db, { tmdbId: 101, title: 'Cand A', rating: 8 });
    rotationCandidatesService.addToQueue(opened.db, { tmdbId: 102, title: 'Cand B', rating: 8 });
    rotationCandidatesService.addToQueue(opened.db, { tmdbId: 103, title: 'Cand C', rating: 8 });

    routeDiskSpace(500); // well above target → budget = min(2, floor(400/10)) = 2
    route('GET', '/movie?tmdbId', () => ({ body: [] }));
    route('GET', '/queue', () => ({ body: { totalRecords: 0, records: [] } }));
    route('GET', '/movie', () => ({ body: [] }));
    route('POST', '/api/v3/movie', ({ body }) => {
      const tmdbId = (body as { tmdbId: number }).tmdbId;
      return { body: { id: tmdbId, title: 'Added', tmdbId, monitored: true, hasFile: false } };
    });

    await rotationScheduler.runOnce(opened.db);

    const adds = calls.filter((c) => c.method === 'POST' && c.url.includes('/api/v3/movie'));
    expect(adds).toHaveLength(2);
    expect(rotationLogService.lastCycleLog(opened.db)?.moviesAdded).toBe(2);
    expect(rotationCandidatesService.listCandidates(opened.db, { status: 'added' }).total).toBe(2);
  });

  it('skips additions when disk is at/below target', async () => {
    enableRadarr();
    rotationSettingsService.setMany(opened.db, [
      { key: 'rotation_target_free_gb', value: '100' },
      { key: 'rotation_daily_additions', value: '3' },
      { key: 'rotation_avg_movie_gb', value: '10' },
    ]);
    rotationCandidatesService.addToQueue(opened.db, { tmdbId: 201, title: 'No Room', rating: 9 });

    routeDiskSpace(80); // below target → budget 0, no eligible removals either
    route('GET', '/movie?tmdbId', () => ({ body: [] }));
    route('GET', '/queue', () => ({ body: { totalRecords: 0, records: [] } }));
    route('GET', '/movie', () => ({ body: [] }));

    await rotationScheduler.runOnce(opened.db);

    const adds = calls.filter((c) => c.method === 'POST' && c.url.includes('/api/v3/movie'));
    expect(adds).toHaveLength(0);
    expect(rotationLogService.lastCycleLog(opened.db)?.moviesAdded).toBe(0);
    expect(rotationCandidatesService.listCandidates(opened.db, { status: 'pending' }).total).toBe(
      1
    );
  });

  it('records a skipped cycle log when Radarr is unconfigured', async () => {
    // No enableRadarr() → getRadarrClient returns null.
    await rotationScheduler.runOnce(opened.db);
    const log = rotationLogService.lastCycleLog(opened.db);
    expect(log?.skippedReason).toBe('Radarr not configured');
  });
});

describe('rotationScheduler — controller toggle', () => {
  it('start arms the timer + fires one immediate cycle; stop clears it', async () => {
    vi.useFakeTimers();
    try {
      const status = rotationScheduler.start({ db: opened.db, intervalMs: 1_000 });
      expect(status.isRunning).toBe(true);
      await vi.runOnlyPendingTimersAsync();
      // Cycle no-ops (Radarr unconfigured) but still writes one log row.
      expect(rotationLogService.listRotationLog(opened.db, 100, 0).total).toBeGreaterThanOrEqual(1);

      rotationScheduler.stop(opened.db);
      expect(rotationScheduler.status(opened.db).isRunning).toBe(false);

      const before = rotationLogService.listRotationLog(opened.db, 100, 0).total;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(rotationLogService.listRotationLog(opened.db, 100, 0).total).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists enabled=true + cron on start, enabled=false on stop', () => {
    vi.useFakeTimers();
    try {
      rotationScheduler.start({ db: opened.db, intervalMs: 5_000, cronExpression: '0 4 * * *' });
      expect(rotationSettingsService.get(opened.db, 'rotation_enabled')).toBe('true');
      expect(rotationSettingsService.get(opened.db, 'rotation_cron_expression')).toBe('0 4 * * *');

      rotationScheduler.stop(opened.db);
      expect(rotationSettingsService.get(opened.db, 'rotation_enabled')).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumeIfEnabled starts only when the persisted flag is "true"', () => {
    vi.useFakeTimers();
    try {
      expect(rotationScheduler.resumeIfEnabled(opened.db)).toBeNull();
      rotationSettingsService.set(opened.db, 'rotation_enabled', 'true');
      const status = rotationScheduler.resumeIfEnabled(opened.db);
      expect(status?.isRunning).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('rotation scheduler — REST', () => {
  it('toggle on reports isRunning, toggle off clears it', async () => {
    vi.useFakeTimers();
    try {
      const on = await makeClient(app()).rotation.schedulerToggle({ enabled: true });
      expect(on.data.isRunning).toBe(true);
      expect((await makeClient(app()).rotation.schedulerStatus()).data.isRunning).toBe(true);

      const off = await makeClient(app()).rotation.schedulerToggle({ enabled: false });
      expect(off.data.isRunning).toBe(false);
    } finally {
      rotationScheduler.stop(opened.db);
      vi.useRealTimers();
    }
  });

  it('cancelLeaving clears the leaving flag and returns success', async () => {
    const movie = moviesService.createMovie(opened.db, { tmdbId: 55, title: 'Going' });
    rotationRemovalQueries.markMoviesAsLeaving(opened.db, [movie.id], '2099-01-01T00:00:00.000Z');

    const leaving = await makeClient(app()).rotation.schedulerLeavingMovies();
    expect(leaving.data.map((m) => m.tmdbId)).toEqual([55]);

    const cancelled = await makeClient(app()).rotation.schedulerCancelLeaving(movie.id);
    expect(cancelled.data.success).toBe(true);
    expect(moviesService.getMovie(opened.db, movie.id).rotationStatus).toBeNull();

    const missing = await makeClient(app()).rotation.schedulerCancelLeaving(movie.id);
    expect(missing.data.success).toBe(false);
  });

  it('getDiskSpace returns available:true with Radarr disks', async () => {
    enableRadarr();
    routeDiskSpace(250, 1000);
    const res = await makeClient(app()).rotation.schedulerDiskSpace();
    expect(res.data.available).toBe(true);
    expect(res.data.disks[0]?.freeSpace).toBe(250 * GB);
  });

  it('getDiskSpace degrades to available:false when Radarr is unconfigured', async () => {
    const res = await makeClient(app()).rotation.schedulerDiskSpace();
    expect(res.data).toEqual({ available: false, disks: [] });
  });

  it('listRotationLog + log-stats reflect written cycles', async () => {
    rotationLogService.writeCycleLog(opened.db, {
      moviesMarkedLeaving: 0,
      moviesRemoved: 2,
      moviesAdded: 1,
      removalsFailed: 0,
      freeSpaceGb: 120,
      targetFreeGb: 100,
      skippedReason: null,
      marked: [],
      removed: [],
      added: [],
      failed: [],
    });

    const log = await makeClient(app()).rotation.listRotationLog({ limit: 10 });
    expect(log.data.total).toBe(1);
    expect(log.data.items[0]?.moviesRemoved).toBe(2);

    const stats = await makeClient(app()).rotation.rotationLogStats();
    expect(stats.data.totalRotated).toBe(3);
    expect(stats.data.streak).toBe(1);
  });
});
