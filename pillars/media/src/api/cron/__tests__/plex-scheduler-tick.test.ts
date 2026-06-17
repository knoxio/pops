/**
 * Unit tests for the periodic-sync tick (`runPlexSyncTick`, slice 9c).
 *
 * The Plex/TMDB/TheTVDB client factories and the three 9b sync ops are
 * mocked at the module boundary so the tick runs with zero network and the
 * assertions focus on what the tick is responsible for: resolving the
 * client once, summing per-op counts, collecting error strings, and writing
 * exactly one `sync_logs` row per tick. No real timers are used.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, syncLogsService, type OpenedMediaDb } from '../../../db/index.js';
import { runPlexSyncTick } from '../plex-scheduler-tick.js';

import type { PlexClient } from '../../clients/plex/client.js';
import type { MovieSyncProgress, TvSyncProgress } from '../../clients/plex/sync/index.js';
import type { WatchlistSyncProgress } from '../../clients/plex/sync/index.js';

const hoisted = vi.hoisted(() => ({
  getPlexClientMock: vi.fn<() => PlexClient | null>(),
  getPlexSectionIdsMock:
    vi.fn<() => { movieSectionId: string | null; tvSectionId: string | null }>(),
  getPlexTokenMock: vi.fn<() => string | null>(),
  getPlexClientIdMock: vi.fn<() => string>(),
  importMoviesMock: vi.fn<() => Promise<MovieSyncProgress>>(),
  importTvShowsMock: vi.fn<() => Promise<TvSyncProgress>>(),
  syncWatchlistMock: vi.fn<() => Promise<WatchlistSyncProgress>>(),
}));

vi.mock('../../clients/plex/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../clients/plex/index.js')>(
    '../../clients/plex/index.js'
  );
  return {
    ...actual,
    getPlexClient: hoisted.getPlexClientMock,
    getPlexSectionIds: hoisted.getPlexSectionIdsMock,
    getPlexToken: hoisted.getPlexTokenMock,
    getPlexClientId: hoisted.getPlexClientIdMock,
  };
});

vi.mock('../../clients/plex/sync/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../clients/plex/sync/index.js')>(
    '../../clients/plex/sync/index.js'
  );
  return {
    ...actual,
    importMoviesFromPlex: hoisted.importMoviesMock,
    importTvShowsFromPlex: hoisted.importTvShowsMock,
    syncWatchlistFromPlex: hoisted.syncWatchlistMock,
  };
});

vi.mock('../../clients/tmdb/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../clients/tmdb/index.js')>(
    '../../clients/tmdb/index.js'
  );
  return { ...actual, getTmdbClient: vi.fn(), getImageCache: vi.fn() };
});

vi.mock('../../clients/thetvdb/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../clients/thetvdb/index.js')>(
    '../../clients/thetvdb/index.js'
  );
  return { ...actual, getTvdbClient: vi.fn() };
});

function movieProgress(over: Partial<MovieSyncProgress> = {}): MovieSyncProgress {
  return { total: 0, processed: 0, synced: 0, skipped: 0, errors: [], ...over };
}

function tvProgress(over: Partial<TvSyncProgress> = {}): TvSyncProgress {
  return {
    total: 0,
    processed: 0,
    synced: 0,
    skipped: 0,
    episodesMatched: 0,
    errors: [],
    skipReasons: [],
    ...over,
  };
}

function watchlistProgress(over: Partial<WatchlistSyncProgress> = {}): WatchlistSyncProgress {
  return {
    total: 0,
    processed: 0,
    added: 0,
    removed: 0,
    skipped: 0,
    errors: [],
    skipReasons: [],
    ...over,
  };
}

const FAKE_CLIENT = {} as PlexClient;

let tmpDir: string;
let opened: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-scheduler-tick-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));

  hoisted.getPlexClientMock.mockReturnValue(FAKE_CLIENT);
  hoisted.getPlexSectionIdsMock.mockReturnValue({ movieSectionId: '1', tvSectionId: '2' });
  hoisted.getPlexTokenMock.mockReturnValue('token');
  hoisted.getPlexClientIdMock.mockReturnValue('client-id');
  hoisted.importMoviesMock.mockResolvedValue(movieProgress({ synced: 3 }));
  hoisted.importTvShowsMock.mockResolvedValue(tvProgress({ synced: 2 }));
  hoisted.syncWatchlistMock.mockResolvedValue(watchlistProgress());
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('runPlexSyncTick', () => {
  it('runs movies + tv + watchlist and writes a sync log with the summed counts', async () => {
    const result = await runPlexSyncTick(opened.db);

    expect(result.moviesSynced).toBe(3);
    expect(result.tvShowsSynced).toBe(2);
    expect(result.errors).toEqual([]);
    expect(hoisted.importMoviesMock).toHaveBeenCalledWith(
      expect.objectContaining({ plexClient: FAKE_CLIENT }),
      '1'
    );
    expect(hoisted.importTvShowsMock).toHaveBeenCalledWith(
      expect.objectContaining({ plexClient: FAKE_CLIENT }),
      '2'
    );
    expect(hoisted.syncWatchlistMock).toHaveBeenCalledOnce();

    const logs = syncLogsService.listSyncLogs(opened.db);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ moviesSynced: 3, tvShowsSynced: 2, errors: null });
    expect(logs[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('writes a single error log and runs nothing when the client is null', async () => {
    hoisted.getPlexClientMock.mockReturnValue(null);

    const result = await runPlexSyncTick(opened.db);

    expect(result.errors).toEqual(['Plex is not configured']);
    expect(hoisted.importMoviesMock).not.toHaveBeenCalled();
    expect(hoisted.syncWatchlistMock).not.toHaveBeenCalled();

    const logs = syncLogsService.listSyncLogs(opened.db);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ moviesSynced: 0, tvShowsSynced: 0 });
    expect(logs[0]?.errors).toEqual(['Plex is not configured']);
  });

  it('skips a section-less op without erroring the whole tick', async () => {
    hoisted.getPlexSectionIdsMock.mockReturnValue({ movieSectionId: null, tvSectionId: '2' });

    const result = await runPlexSyncTick(opened.db);

    expect(hoisted.importMoviesMock).not.toHaveBeenCalled();
    expect(hoisted.importTvShowsMock).toHaveBeenCalledWith(expect.anything(), '2');
    expect(result.moviesSynced).toBe(0);
    expect(result.tvShowsSynced).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it('collects per-op errors without aborting later ops', async () => {
    hoisted.importMoviesMock.mockRejectedValue(new Error('movies upstream 500'));
    hoisted.importTvShowsMock.mockResolvedValue(tvProgress({ synced: 1 }));
    hoisted.syncWatchlistMock.mockResolvedValue(
      watchlistProgress({ errors: [{ title: 'Dune', reason: 'no tmdb id' }] })
    );

    const result = await runPlexSyncTick(opened.db);

    expect(result.tvShowsSynced).toBe(1);
    expect(result.errors).toContain('movies: movies upstream 500');
    expect(result.errors).toContain('watchlist:Dune: no tmdb id');

    const logs = syncLogsService.listSyncLogs(opened.db);
    expect(logs[0]?.errors).toEqual(result.errors);
  });

  it('honours explicit section-id overrides over the persisted settings', async () => {
    await runPlexSyncTick(opened.db, { movieSectionId: '99', tvSectionId: '88' });

    expect(hoisted.importMoviesMock).toHaveBeenCalledWith(expect.anything(), '99');
    expect(hoisted.importTvShowsMock).toHaveBeenCalledWith(expect.anything(), '88');
  });
});
