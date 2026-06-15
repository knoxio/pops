/**
 * Tests for Plex sync scheduler — lifecycle, settings persistence, and logs.
 *
 * After PRD-074, the scheduler registers BullMQ repeatable jobs instead of
 * using setInterval. The BullMQ queue is mocked so no Redis connection is
 * needed. Sync-execution tests (timer ticks) are removed — the actual sync
 * logic is tested via the handler in src/jobs/handlers/sync.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SETTINGS_KEYS } from '../../core/settings/keys.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const settingsStore = new Map<string, string>();
const mockSelectSyncLogs = vi.fn().mockReturnValue([]);
const mockInsertSyncLog = vi.fn();

// Mock BullMQ queue — scheduler calls upsertJobScheduler / removeJobScheduler
const mockUpsertJobScheduler = vi.fn().mockResolvedValue({});
const mockRemoveJobScheduler = vi.fn().mockResolvedValue(true);
const mockGetJobSchedulers = vi.fn().mockResolvedValue([]);

vi.mock('../../../jobs/queues.js', () => ({
  getSyncQueue: vi.fn(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
    removeJobScheduler: mockRemoveJobScheduler,
    getJobSchedulers: mockGetJobSchedulers,
  })),
}));

vi.mock('./service.js', () => ({
  getPlexClient: vi.fn(),
  getPlexSectionIds: vi.fn().mockResolvedValue({ movieSectionId: null, tvSectionId: null }),
  getPlexToken: vi.fn().mockResolvedValue('test-plex-token'),
}));

vi.mock('../../../db.js', () => ({
  getCoreDrizzle: vi.fn(() => ({
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: () => ({
            get: (): unknown => null,
            all: (): unknown[] => mockSelectSyncLogs() as unknown[],
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        if ('syncedAt' in vals) mockInsertSyncLog(vals);
        return { run: vi.fn() };
      },
    }),
  })),
}));

class NotFoundCallError extends Error {
  data = { code: 'NOT_FOUND' as const };
}

const setStub = vi.fn(async ({ key, value }: { key: string; value: string }) => {
  settingsStore.set(key, value);
  return { data: { key, value }, message: 'Setting saved' };
});

const deleteStub = vi.fn(async ({ key }: { key: string }) => {
  if (!settingsStore.has(key)) throw new NotFoundCallError(`not found: ${key}`);
  settingsStore.delete(key);
  return { message: 'Setting deleted' };
});

const getManyStub = vi.fn(async ({ keys }: { keys: string[] }) => {
  const settings: Record<string, string> = {};
  for (const k of keys) {
    const v = settingsStore.get(k);
    if (v !== undefined) settings[k] = v;
  }
  return { settings };
});

vi.mock('@pops/pillar-sdk/server', () => ({
  pillar: () => ({
    settings: {
      set: { orThrow: setStub },
      delete: { orThrow: deleteStub },
      getMany: { orThrow: getManyStub },
    },
  }),
}));

vi.mock('../../../db/media-db-handle.js', () => ({
  getMediaDrizzle: vi.fn(() => ({
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: () => ({
            get: (): unknown => null,
            all: (): unknown[] => mockSelectSyncLogs() as unknown[],
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        if ('syncedAt' in vals) mockInsertSyncLog(vals);
        return { run: vi.fn() };
      },
    }),
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
  desc: vi.fn(),
}));

vi.mock('@pops/media-db', () => ({
  syncLogs: { syncedAt: 'synced_at', id: 'id', errors: 'errors' },
}));

// The scheduler reads enable state via the features framework; in this isolated
// test the registry is empty and we don't exercise feature registration. Mock
// `isEnabled` so that it mirrors the in-test settings store behaviour for the
// `media.plex.scheduler` key (legacy `plex_scheduler_enabled`).
vi.mock('../../core/features/index.js', () => ({
  isEnabled: vi.fn((key: string) => {
    if (key === 'media.plex.scheduler') {
      return settingsStore.get('plex_scheduler_enabled') === 'true';
    }
    return false;
  }),
}));

import {
  _resetScheduler,
  getPersistedSchedulerState,
  getSchedulerStatus,
  getSyncLogs,
  resumeSchedulerIfEnabled,
  startScheduler,
  stopScheduler,
} from './scheduler.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  _resetScheduler();
  settingsStore.clear();
});

afterEach(() => {
  _resetScheduler();
});

// ---------------------------------------------------------------------------
// startScheduler
// ---------------------------------------------------------------------------

describe('startScheduler', () => {
  it('returns running status', async () => {
    const status = await startScheduler({ intervalMs: 5000 });

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
    expect(status.nextSyncAt).not.toBeNull();
  });

  it('uses default interval when not specified', async () => {
    const status = await startScheduler();

    expect(status.intervalMs).toBe(60 * 60 * 1000);
    expect(status.isRunning).toBe(true);
  });

  it('is a no-op when already running', async () => {
    await startScheduler({ intervalMs: 5000 });
    const status = await startScheduler({ intervalMs: 10000 });

    expect(status.intervalMs).toBe(5000);
  });

  it('persists scheduler config to settings', async () => {
    await startScheduler({ intervalMs: 30000 });

    expect(settingsStore.get(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED)).toBe('true');
    expect(settingsStore.get(SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS)).toBe('30000');
  });

  it('registers a BullMQ job scheduler', async () => {
    await startScheduler({ intervalMs: 5000 });

    await vi.waitFor(() => expect(mockUpsertJobScheduler).toHaveBeenCalledOnce());
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      expect.any(String),
      { every: 5000 },
      expect.objectContaining({ name: 'plexScheduledSync' })
    );
  });
});

// ---------------------------------------------------------------------------
// stopScheduler
// ---------------------------------------------------------------------------

describe('stopScheduler', () => {
  it('stops a running scheduler', async () => {
    await startScheduler({ intervalMs: 5000 });
    const status = await stopScheduler();

    expect(status.isRunning).toBe(false);
    expect(status.nextSyncAt).toBeNull();
  });

  it('is a no-op when not running', async () => {
    const status = await stopScheduler();
    expect(status.isRunning).toBe(false);
  });

  it('clears persisted scheduler config', async () => {
    await startScheduler({ intervalMs: 5000 });
    expect(settingsStore.get(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED)).toBe('true');

    await stopScheduler();

    expect(settingsStore.has(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED)).toBe(false);
    expect(settingsStore.has(SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS)).toBe(false);
  });

  it('removes the BullMQ job scheduler', async () => {
    await startScheduler({ intervalMs: 5000 });
    await vi.waitFor(() => expect(mockUpsertJobScheduler).toHaveBeenCalled());

    await stopScheduler();

    await vi.waitFor(() => expect(mockRemoveJobScheduler).toHaveBeenCalledOnce());
  });
});

// ---------------------------------------------------------------------------
// getSchedulerStatus
// ---------------------------------------------------------------------------

describe('getSchedulerStatus', () => {
  it('returns initial state', () => {
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(false);
    expect(status.lastSyncAt).toBeNull();
    expect(status.lastSyncError).toBeNull();
    expect(status.nextSyncAt).toBeNull();
  });

  it('reflects running state after start', async () => {
    await startScheduler({ intervalMs: 5000 });
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

describe('persistence', () => {
  it('getPersistedSchedulerState returns null when not enabled', async () => {
    const state = await getPersistedSchedulerState();
    expect(state).toBeNull();
  });

  it('getPersistedSchedulerState returns config when enabled', async () => {
    settingsStore.set(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED, 'true');
    settingsStore.set(SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS, '45000');

    const state = await getPersistedSchedulerState();
    expect(state).toEqual({ enabled: true, intervalMs: 45000 });
  });

  it('resumeSchedulerIfEnabled starts scheduler with persisted config', async () => {
    settingsStore.set(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED, 'true');
    settingsStore.set(SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS, '60000');

    const status = await resumeSchedulerIfEnabled();
    expect(status).not.toBeNull();
    expect(status!.isRunning).toBe(true);
    expect(status!.intervalMs).toBe(60000);
  });

  it('resumeSchedulerIfEnabled returns null when not enabled', async () => {
    const status = await resumeSchedulerIfEnabled();
    expect(status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getSyncLogs
// ---------------------------------------------------------------------------

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
