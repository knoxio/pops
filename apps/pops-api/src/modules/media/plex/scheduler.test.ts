/**
 * Tests for Plex sync scheduler — periodic polling, lifecycle, and persistence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const settingsStore = new Map<string, string>();
const mockInsertSyncLog = vi.fn();
const mockSelectSyncLogs = vi.fn().mockReturnValue([]);

vi.mock('./service.js', () => ({
  getPlexClient: vi.fn(),
  getPlexSectionIds: vi.fn().mockReturnValue({ movieSectionId: null, tvSectionId: null }),
  getPlexToken: vi.fn().mockReturnValue('test-plex-token'),
}));

vi.mock('./sync-movies.js', () => ({
  importMoviesFromPlex: vi.fn(),
}));

vi.mock('./sync-tv.js', () => ({
  importTvShowsFromPlex: vi.fn(),
}));

vi.mock('./sync-watchlist.js', () => ({
  syncWatchlistFromPlex: vi.fn().mockResolvedValue({
    total: 0,
    processed: 0,
    added: 0,
    removed: 0,
    skipped: 0,
    errors: [],
  }),
}));

vi.mock('../../../db.js', () => ({
  getDrizzle: vi.fn(() => ({
    select: () => ({
      from: (_table: unknown) => ({
        where: (key: string) => ({
          get: () => {
            const val = settingsStore.get(key);
            return val !== undefined ? { value: val } : undefined;
          },
        }),
        orderBy: () => ({
          limit: () => ({
            all: (): unknown[] => mockSelectSyncLogs() as unknown[],
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        if ('syncedAt' in vals) {
          mockInsertSyncLog(vals);
          return { run: vi.fn() };
        }
        if ('key' in vals && 'value' in vals) {
          settingsStore.set(vals.key as string, vals.value as string);
        }
        return {
          onConflictDoUpdate: () => ({ run: vi.fn() }),
          run: vi.fn(),
        };
      },
    }),
    delete: () => ({
      where: (key: string) => ({
        run: () => settingsStore.delete(key),
      }),
    }),
  })),
}));

// Re-mock drizzle ORM operators to prevent real DB access
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
  desc: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  settings: { key: 'key', value: 'value' },
  syncLogs: { syncedAt: 'synced_at', id: 'id' },
}));

import type { PlexClient } from './client.js';
import {
  _resetScheduler,
  _triggerSync,
  getPersistedSchedulerState,
  getSchedulerStatus,
  getSyncLogs,
  resumeSchedulerIfEnabled,
  startScheduler,
  stopScheduler,
} from './scheduler.js';
import { getPlexClient, getPlexSectionIds } from './service.js';
import { importMoviesFromPlex } from './sync-movies.js';
import { importTvShowsFromPlex } from './sync-tv.js';

const mockGetPlexClient = vi.mocked(getPlexClient);
const mockGetPlexSectionIds = vi.mocked(getPlexSectionIds);
const mockImportMovies = vi.mocked(importMoviesFromPlex);
const mockImportTvShows = vi.mocked(importTvShowsFromPlex);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  _resetScheduler();
  settingsStore.clear();
});

afterEach(() => {
  _resetScheduler();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startScheduler', () => {
  it('returns running status', () => {
    const status = startScheduler({ intervalMs: 5000 });

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
    expect(status.nextSyncAt).not.toBeNull();
  });

  it('uses default interval when not specified', () => {
    const status = startScheduler();

    expect(status.intervalMs).toBe(60 * 60 * 1000);
    expect(status.isRunning).toBe(true);
  });

  it('is a no-op when already running', () => {
    startScheduler({ intervalMs: 5000 });
    const status = startScheduler({ intervalMs: 10000 });

    // Should keep original interval
    expect(status.intervalMs).toBe(5000);
  });

  it('persists scheduler config to settings', () => {
    startScheduler({ intervalMs: 30000 });

    expect(settingsStore.get('plex_scheduler_enabled')).toBe('true');
    expect(settingsStore.get('plex_scheduler_interval_ms')).toBe('30000');
  });
});

describe('stopScheduler', () => {
  it('stops a running scheduler', () => {
    startScheduler({ intervalMs: 5000 });
    const status = stopScheduler();

    expect(status.isRunning).toBe(false);
    expect(status.nextSyncAt).toBeNull();
  });

  it('is a no-op when not running', () => {
    const status = stopScheduler();
    expect(status.isRunning).toBe(false);
  });

  it('clears persisted scheduler config', () => {
    startScheduler({ intervalMs: 5000 });
    expect(settingsStore.get('plex_scheduler_enabled')).toBe('true');

    stopScheduler();

    expect(settingsStore.has('plex_scheduler_enabled')).toBe(false);
    expect(settingsStore.has('plex_scheduler_interval_ms')).toBe(false);
  });
});

describe('getSchedulerStatus', () => {
  it('returns initial state', () => {
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(false);
    expect(status.lastSyncAt).toBeNull();
    expect(status.lastSyncError).toBeNull();
    expect(status.nextSyncAt).toBeNull();
    expect(status.moviesSynced).toBe(0);
    expect(status.tvShowsSynced).toBe(0);
  });

  it('reflects running state after start', () => {
    startScheduler({ intervalMs: 5000 });
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
  });
});

describe('sync execution', () => {
  it('runs sync on interval tick', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: '1', tvSectionId: '2' });
    mockImportMovies.mockResolvedValue({
      total: 5,
      processed: 5,
      synced: 3,
      skipped: 2,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 2,
      processed: 2,
      synced: 1,
      skipped: 1,
      episodesMatched: 5,
      errors: [],
      skipReasons: [],
    });

    startScheduler({ intervalMs: 5000 });

    // Advance past interval
    vi.advanceTimersByTime(5000);
    // Let promises settle
    await vi.advanceTimersByTimeAsync(0);

    const status = getSchedulerStatus();
    expect(status.lastSyncAt).not.toBeNull();
    expect(status.lastSyncError).toBeNull();
    expect(status.moviesSynced).toBe(3);
    expect(status.tvShowsSynced).toBe(1);
    expect(mockImportMovies).toHaveBeenCalledWith(mockClient, '1');
    expect(mockImportTvShows).toHaveBeenCalledWith(mockClient, '2');
  });

  it('writes sync log after successful sync', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: '1', tvSectionId: '2' });
    mockImportMovies.mockResolvedValue({
      total: 2,
      processed: 2,
      synced: 2,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      episodesMatched: 3,
      errors: [],
      skipReasons: [],
    });

    startScheduler({ intervalMs: 5000, movieSectionId: '1', tvSectionId: '2' });
    await _triggerSync();

    expect(mockInsertSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        moviesSynced: 2,
        tvShowsSynced: 1,
        errors: null,
      })
    );
  });

  it('records error when Plex is not configured', async () => {
    mockGetPlexClient.mockReturnValue(null);

    await _triggerSync();

    const status = getSchedulerStatus();
    expect(status.lastSyncError).toContain('Plex not configured');
    expect(status.lastSyncAt).not.toBeNull();
  });

  it('writes sync log with error when Plex is not configured', async () => {
    mockGetPlexClient.mockReturnValue(null);

    await _triggerSync();

    expect(mockInsertSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        moviesSynced: 0,
        tvShowsSynced: 0,
      })
    );
    // errors field should be a JSON string containing the error
    const logCall = mockInsertSyncLog.mock.calls[0]![0] as Record<string, unknown>;
    expect(logCall.errors).toContain('Plex not configured');
  });

  it('records error when sync throws', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: '1', tvSectionId: '2' });
    mockImportMovies.mockRejectedValue(new Error('Network timeout'));

    startScheduler({ intervalMs: 5000, movieSectionId: '1', tvSectionId: '2' });
    await _triggerSync();

    const status = getSchedulerStatus();
    expect(status.lastSyncError).toContain('Network timeout');
    expect(status.lastSyncAt).not.toBeNull();
  });

  it('continues running after sync error', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: '1', tvSectionId: '2' });
    mockImportMovies.mockRejectedValue(new Error('Plex down'));

    startScheduler({ intervalMs: 5000, movieSectionId: '1', tvSectionId: '2' });

    // First tick — error
    vi.advanceTimersByTime(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSchedulerStatus().isRunning).toBe(true);
    expect(getSchedulerStatus().lastSyncError).toContain('Plex down');

    // Second tick — success
    mockImportMovies.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
      skipReasons: [],
    });

    vi.advanceTimersByTime(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSchedulerStatus().isRunning).toBe(true);
    expect(getSchedulerStatus().lastSyncError).toBeNull();
    expect(getSchedulerStatus().moviesSynced).toBe(1);
  });

  it('accumulates sync counts across multiple cycles', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: '1', tvSectionId: '2' });
    mockImportMovies.mockResolvedValue({
      total: 2,
      processed: 2,
      synced: 2,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      episodesMatched: 3,
      errors: [],
      skipReasons: [],
    });

    startScheduler({ intervalMs: 1000, movieSectionId: '1', tvSectionId: '2' });

    // Run 3 cycles
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000);
      await vi.advanceTimersByTimeAsync(0);
    }

    const status = getSchedulerStatus();
    expect(status.moviesSynced).toBe(6);
    expect(status.tvShowsSynced).toBe(3);
  });

  it('uses custom section IDs', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
      skipReasons: [],
    });

    startScheduler({
      intervalMs: 1000,
      movieSectionId: '3',
      tvSectionId: '4',
    });

    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockImportMovies).toHaveBeenCalledWith(mockClient, '3');
    expect(mockImportTvShows).toHaveBeenCalledWith(mockClient, '4');
  });

  it('does not sync after stop', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: '1', tvSectionId: '2' });
    mockImportMovies.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
      skipReasons: [],
    });

    startScheduler({ intervalMs: 5000, movieSectionId: '1', tvSectionId: '2' });
    stopScheduler();

    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockImportMovies).not.toHaveBeenCalled();
    expect(mockImportTvShows).not.toHaveBeenCalled();
  });
});

describe('persistence', () => {
  it('getPersistedSchedulerState returns null when not enabled', () => {
    const state = getPersistedSchedulerState();
    expect(state).toBeNull();
  });

  it('getPersistedSchedulerState returns config when enabled', () => {
    settingsStore.set('plex_scheduler_enabled', 'true');
    settingsStore.set('plex_scheduler_interval_ms', '45000');

    const state = getPersistedSchedulerState();
    expect(state).toEqual({ enabled: true, intervalMs: 45000 });
  });

  it('resumeSchedulerIfEnabled starts scheduler with persisted config', () => {
    settingsStore.set('plex_scheduler_enabled', 'true');
    settingsStore.set('plex_scheduler_interval_ms', '60000');

    const status = resumeSchedulerIfEnabled();
    expect(status).not.toBeNull();
    expect(status!.isRunning).toBe(true);
    expect(status!.intervalMs).toBe(60000);
  });

  it('resumeSchedulerIfEnabled returns null when not enabled', () => {
    const status = resumeSchedulerIfEnabled();
    expect(status).toBeNull();
  });
});

describe('getSyncLogs', () => {
  it('returns mapped sync log entries', () => {
    mockSelectSyncLogs.mockReturnValue([
      {
        id: 1,
        syncedAt: '2026-03-27T10:00:00.000Z',
        moviesSynced: 5,
        tvShowsSynced: 2,
        errors: '["Movie: Test — No TMDB match"]',
        durationMs: 1500,
      },
      {
        id: 2,
        syncedAt: '2026-03-27T09:00:00.000Z',
        moviesSynced: 3,
        tvShowsSynced: 1,
        errors: null,
        durationMs: 1200,
      },
    ]);

    const logs = getSyncLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0]).toEqual({
      id: 1,
      syncedAt: '2026-03-27T10:00:00.000Z',
      moviesSynced: 5,
      tvShowsSynced: 2,
      errors: ['Movie: Test — No TMDB match'],
      durationMs: 1500,
    });
    expect(logs[1]!.errors).toBeNull();
  });

  it('returns empty array when no logs exist', () => {
    mockSelectSyncLogs.mockReturnValue([]);
    const logs = getSyncLogs();
    expect(logs).toEqual([]);
  });
});

describe('_triggerSync', () => {
  it('runs a sync cycle immediately', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: '1', tvSectionId: '2' });
    mockImportMovies.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
      skipReasons: [],
    });

    startScheduler({ intervalMs: 60000, movieSectionId: '1', tvSectionId: '2' });
    await _triggerSync();

    expect(mockImportMovies).toHaveBeenCalledOnce();
    expect(mockImportTvShows).toHaveBeenCalledOnce();
    expect(getSchedulerStatus().lastSyncAt).not.toBeNull();
    expect(getSchedulerStatus().moviesSynced).toBe(1);
  });

  it('skips sync when section IDs are not configured', async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: null, tvSectionId: null });

    startScheduler({ intervalMs: 60000 });
    await _triggerSync();

    expect(mockImportMovies).not.toHaveBeenCalled();
    expect(mockImportTvShows).not.toHaveBeenCalled();
  });
});
