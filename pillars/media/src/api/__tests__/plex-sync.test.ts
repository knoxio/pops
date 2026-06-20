/**
 * Integration tests for the `plex.*` sync routes (slice 9b) via supertest.
 *
 * The Plex Media Server API is mocked at `globalThis.fetch` (method + url
 * substring routes); the TMDB / TheTVDB client factories are mocked at the
 * module boundary and their network methods spied — so the full handler →
 * job-runner → sync-op → db-service path runs with zero network. Job
 * execution is fire-and-forget; `waitForJob` polls `getSyncJobStatus` until a
 * terminal state, mirroring finance's `waitForImportCompletion` helper.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, plexSettingsService, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { TheTvdbAuth } from '../clients/thetvdb/auth.js';
import { TheTvdbClient } from '../clients/thetvdb/client.js';
import { TmdbClient } from '../clients/tmdb/client.js';
import { ImageCacheService } from '../clients/tmdb/image-cache.js';
import { makeClient } from './test-utils.js';

import type { SyncJob } from '../../db/index.js';
import type { TmdbMovieDetail } from '../clients/tmdb/types.js';

const PLEX_URL = 'http://plex.test:32400';
const MOVIE_SECTION = '1';

interface RouteRule {
  method: string;
  match: string;
  handler: () => { status?: number; body: unknown };
}

let routes: RouteRule[];

function route(method: string, match: string, handler: RouteRule['handler']): void {
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
  const rule = routes.find((r) => r.method === method && url.includes(r.match));
  if (!rule) return Promise.resolve(jsonResponse({ error: `unmatched ${method} ${url}` }, 404));
  const res = rule.handler();
  return Promise.resolve(jsonResponse(res.body, res.status ?? 200));
});

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
    genres: [{ id: 28, name: 'Action' }],
    productionCompanies: [],
    spokenLanguages: [],
    ...overrides,
  };
}

interface PlexItemStub {
  ratingKey: string;
  title: string;
  type: string;
  year?: number;
  viewCount?: number;
  Guid?: Array<{ id: string }>;
}

function sectionAll(items: PlexItemStub[]): { body: unknown } {
  return {
    body: { MediaContainer: { size: items.length, totalSize: items.length, Metadata: items } },
  };
}

let tmpDir: string;
let mediaDb: OpenedMediaDb;
let tmdb: TmdbClient;
let tvdb: TheTvdbClient;
let imageCache: ImageCacheService;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-plex-sync-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
  routes = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);

  tmdb = new TmdbClient('test-key');
  tvdb = new TheTvdbClient(new TheTvdbAuth('test-key'));
  imageCache = new ImageCacheService(join(tmpDir, 'images'));
  vi.spyOn(imageCache, 'downloadMovieImages').mockResolvedValue();
  vi.spyOn(imageCache, 'downloadTvShowImages').mockResolvedValue();
  getTmdbClientMock.mockReturnValue(tmdb);
  getTvdbClientMock.mockReturnValue(tvdb);
  getImageCacheMock.mockReturnValue(imageCache);

  plexSettingsService.setSetting(mediaDb.db, 'plex_url', PLEX_URL);
  plexSettingsService.setSetting(mediaDb.db, 'plex_token', 'raw-token');
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function client() {
  return makeClient(
    createMediaApiApp({ mediaDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3003' })
  );
}

/** Poll a job until it leaves `running`. Fails fast rather than hanging. */
async function waitForJob(jobId: string, maxPolls = 50): Promise<SyncJob> {
  for (let i = 0; i < maxPolls; i++) {
    const { data } = await client().plex.getSyncJobStatus(jobId);
    if (data.status !== 'running') return data;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`job ${jobId} did not settle within ${maxPolls} polls`);
}

describe('plex sync — startSyncJob lifecycle', () => {
  it('runs a movie sync running → completed and creates the movie', async () => {
    route('GET', '/library/sections/1/all', () =>
      sectionAll([
        {
          ratingKey: 'p1',
          title: 'The Matrix',
          type: 'movie',
          year: 1999,
          Guid: [{ id: 'tmdb://603' }],
        },
      ])
    );
    vi.spyOn(tmdb, 'getMovie').mockResolvedValue(movieDetail());

    const { data } = await client().plex.startSyncJob({
      jobType: 'plexSyncMovies',
      sectionId: MOVIE_SECTION,
    });
    expect(data.jobId).toMatch(/[0-9a-f-]{36}/);

    const job = await waitForJob(data.jobId);
    expect(job.status).toBe('completed');
    expect(job.completedAt).not.toBeNull();
    expect(job.durationMs).not.toBeNull();
    expect(job.result).toMatchObject({ total: 1, processed: 1, synced: 1, skipped: 0 });

    const listed = await client().library.list();
    expect(listed.data.map((i) => i.title)).toContain('The Matrix');
  });

  it('transitions to failed + error when the sync op throws', async () => {
    route('GET', '/library/sections/1/all', () => ({ status: 500, body: { error: 'boom' } }));

    const { data } = await client().plex.startSyncJob({
      jobType: 'plexSyncMovies',
      sectionId: MOVIE_SECTION,
    });
    const job = await waitForJob(data.jobId);

    expect(job.status).toBe('failed');
    expect(job.error).toBeTruthy();
    expect(job.completedAt).not.toBeNull();
  });

  it('409s when Plex is not configured', async () => {
    plexSettingsService.deleteSetting(mediaDb.db, 'plex_url');
    plexSettingsService.deleteSetting(mediaDb.db, 'plex_token');
    await expect(
      client().plex.startSyncJob({ jobType: 'plexSyncMovies', sectionId: MOVIE_SECTION })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('400s a missing sectionId-dependent op at completion (failed job, not a 4xx)', async () => {
    const { data } = await client().plex.startSyncJob({ jobType: 'plexSyncMovies' });
    const job = await waitForJob(data.jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('sectionId is required');
  });

  it('rejects the deferred discover job type at the contract boundary', async () => {
    await expect(
      client().plex.startSyncJob({ jobType: 'plexSyncDiscoverWatches', sectionId: '1' })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('plex sync — status reads', () => {
  it('404s an unknown job id', async () => {
    await expect(client().plex.getSyncJobStatus('does-not-exist')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('getLastSyncResults returns the latest completed result per type', async () => {
    route('GET', '/library/sections/1/all', () => sectionAll([]));

    const first = await client().plex.startSyncJob({
      jobType: 'plexSyncMovies',
      sectionId: MOVIE_SECTION,
    });
    await waitForJob(first.data.jobId);
    const second = await client().plex.startSyncJob({
      jobType: 'plexSyncMovies',
      sectionId: MOVIE_SECTION,
    });
    const secondJob = await waitForJob(second.data.jobId);

    const { data } = await client().plex.getLastSyncResults();
    expect(data['plexSyncMovies']?.id).toBe(secondJob.id);
    expect(data['plexSyncTvShows']).toBeNull();
    expect(data['plexSyncWatchlist']).toBeNull();
    expect(data['plexSyncWatchHistory']).toBeNull();
  });

  it('getActiveSyncJobs lists only running jobs', async () => {
    route('GET', '/library/sections/1/all', () => sectionAll([]));
    const { data } = await client().plex.startSyncJob({
      jobType: 'plexSyncMovies',
      sectionId: MOVIE_SECTION,
    });
    await waitForJob(data.jobId);

    const active = await client().plex.getActiveSyncJobs();
    expect(active.data).toEqual([]);
  });
});
