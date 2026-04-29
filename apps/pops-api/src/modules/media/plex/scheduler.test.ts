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
  getPlexSectionIds: vi.fn().mockReturnValue({ movieSectionId: null, tvSectionId: null }),
  getPlexToken: vi.fn().mockReturnValue('test-plex-token'),
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
            get: (): unknown => null,
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

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
  desc: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  settings: { key: 'key', value: 'value' },
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

    expect(status.intervalMs).toBe(5000);
  });

  it('persists scheduler config to settings', () => {
    startScheduler({ intervalMs: 30000 });

    expect(settingsStore.get(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED)).toBe('true');
    expect(settingsStore.get(SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS)).toBe('30000');
  });

  it('registers a BullMQ job scheduler', async () => {
    startScheduler({ intervalMs: 5000 });

    // upsertJobScheduler is called async (fire-and-forget)
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
    expect(settingsStore.get(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED)).toBe('true');

    stopScheduler();

    expect(settingsStore.has(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED)).toBe(false);
    expect(settingsStore.has(SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS)).toBe(false);
  });

  it('removes the BullMQ job scheduler', async () => {
    startScheduler({ intervalMs: 5000 });
    await vi.waitFor(() => expect(mockUpsertJobScheduler).toHaveBeenCalled());

    stopScheduler();

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

  it('reflects running state after start', () => {
    startScheduler({ intervalMs: 5000 });
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

describe('persistence', () => {
  it('getPersistedSchedulerState returns null when not enabled', () => {
    const state = getPersistedSchedulerState();
    expect(state).toBeNull();
  });

  it('getPersistedSchedulerState returns config when enabled', () => {
    settingsStore.set(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED, 'true');
    settingsStore.set(SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS, '45000');

    const state = getPersistedSchedulerState();
    expect(state).toEqual({ enabled: true, intervalMs: 45000 });
  });

  it('resumeSchedulerIfEnabled starts scheduler with persisted config', () => {
    settingsStore.set(SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED, 'true');
    settingsStore.set(SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS, '60000');

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
