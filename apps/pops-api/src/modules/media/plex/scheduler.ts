/**
 * Plex sync scheduler — BullMQ repeatable job for periodic library polling.
 *
 * Public API is unchanged from the in-memory implementation:
 *   startScheduler / stopScheduler / getSchedulerStatus / resumeSchedulerIfEnabled
 *
 * Sync log persistence and stats helpers live in `scheduler-sync-logs.ts`.
 *
 * PRD-074 US-05
 */
import { pillar } from '@pops/pillar-sdk/server';

import { getSyncQueue } from '../../../jobs/queues.js';
import { FeatureNotFoundError } from '../../core/features/errors.js';
import { isEnabled } from '../../core/features/index.js';
import { SETTINGS_KEYS, type SettingsKey } from '../../core/settings/keys.js';
import { getLastSyncAt, getLastSyncCounts, getLastSyncError } from './scheduler-sync-logs.js';
import { getPlexSectionIds } from './service.js';

function isPlexSchedulerEnabled(): boolean {
  try {
    return isEnabled('media.plex.scheduler');
  } catch (err) {
    if (err instanceof FeatureNotFoundError) return false;
    throw err;
  }
}

export {
  getSyncLogs,
  writeSyncLog,
  type SyncLogEntry,
  type SyncLogRecord,
} from './scheduler-sync-logs.js';

import { writeSyncLog as writeSyncLogImpl } from './scheduler-sync-logs.js';

import type { SyncLogRecord } from './scheduler-sync-logs.js';

export interface SchedulerStatus {
  isRunning: boolean;
  intervalMs: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  nextSyncAt: string | null;
  moviesSynced: number;
  tvShowsSynced: number;
}

export interface SchedulerOptions {
  intervalMs?: number;
  movieSectionId?: string;
  tvSectionId?: string;
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const SCHEDULER_ID = 'pops-plex-scheduled-sync';

const SCHEDULER_KEYS = {
  enabled: SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED,
  intervalMs: SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS,
  movieSectionId: SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID,
  tvSectionId: SETTINGS_KEYS.PLEX_TV_SECTION_ID,
} as const;

type CoreSettingsShape = {
  settings: {
    set: (input: { key: SettingsKey; value: string }) => {
      data: { key: string; value: string };
      message: string;
    };
    delete: (input: { key: SettingsKey }) => { message: string };
    getMany: (input: { keys: string[] }) => { settings: Record<string, string> };
  };
};

function core(): ReturnType<typeof pillar<CoreSettingsShape>> {
  return pillar<CoreSettingsShape>('core');
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const data = (err as { data?: { code?: string } }).data;
  return data?.code === 'NOT_FOUND';
}

let isRunning = false;
let intervalMs = DEFAULT_INTERVAL_MS;
let nextSyncAt: string | null = null;
let movieSectionId: string | null = null;
let tvSectionId: string | null = null;

async function persistSchedulerConfig(): Promise<void> {
  await core().settings.set.orThrow({ key: SCHEDULER_KEYS.enabled, value: 'true' });
  await core().settings.set.orThrow({
    key: SCHEDULER_KEYS.intervalMs,
    value: String(intervalMs),
  });
}

async function deleteSettingIfExists(key: SettingsKey): Promise<void> {
  try {
    await core().settings.delete.orThrow({ key });
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
}

async function clearSchedulerConfig(): Promise<void> {
  await deleteSettingIfExists(SCHEDULER_KEYS.enabled);
  await deleteSettingIfExists(SCHEDULER_KEYS.intervalMs);
}

/** Register a BullMQ repeatable job for periodic Plex sync. No-op if already running. */
export async function startScheduler(options: SchedulerOptions = {}): Promise<SchedulerStatus> {
  if (isRunning) return getSchedulerStatus();

  intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const saved = await getPlexSectionIds();
  movieSectionId = options.movieSectionId ?? saved.movieSectionId;
  tvSectionId = options.tvSectionId ?? saved.tvSectionId;
  nextSyncAt = new Date(Date.now() + intervalMs).toISOString();

  const syncQ = getSyncQueue();
  if (syncQ) {
    void syncQ
      .upsertJobScheduler(
        SCHEDULER_ID,
        { every: intervalMs },
        {
          name: 'plexScheduledSync',
          data: {
            type: 'plexScheduledSync',
            movieSectionId: movieSectionId ?? undefined,
            tvSectionId: tvSectionId ?? undefined,
          },
        }
      )
      .catch((err: unknown) => {
        console.error('[Plex Scheduler] Failed to register BullMQ scheduler:', err);
      });
  }

  isRunning = true;
  await persistSchedulerConfig();
  return getSchedulerStatus();
}

/** Remove the BullMQ repeatable job and stop the scheduler. */
export async function stopScheduler(): Promise<SchedulerStatus> {
  if (isRunning) {
    const syncQ = getSyncQueue();
    if (syncQ) {
      void syncQ.removeJobScheduler(SCHEDULER_ID).catch((err: unknown) => {
        console.error('[Plex Scheduler] Failed to remove BullMQ scheduler:', err);
      });
    }
  }
  isRunning = false;
  nextSyncAt = null;
  await clearSchedulerConfig();
  return getSchedulerStatus();
}

/**
 * Stop the local running flag without touching persisted settings.
 * Used during graceful shutdown so the scheduler auto-resumes on restart.
 */
export function stopPlexSchedulerTask(): void {
  isRunning = false;
  nextSyncAt = null;
  console.warn('[Plex Scheduler] Scheduler flag cleared (settings preserved for auto-resume)');
}

export function getSchedulerStatus(): SchedulerStatus {
  const counts = getLastSyncCounts();
  return {
    isRunning,
    intervalMs,
    lastSyncAt: getLastSyncAt(),
    lastSyncError: getLastSyncError(),
    nextSyncAt,
    moviesSynced: counts.moviesSynced,
    tvShowsSynced: counts.tvShowsSynced,
  };
}

export async function getPersistedSchedulerState(): Promise<{
  enabled: boolean;
  intervalMs: number;
} | null> {
  if (!isPlexSchedulerEnabled()) return null;
  const { settings } = await core().settings.getMany.orThrow({
    keys: [SCHEDULER_KEYS.enabled, SCHEDULER_KEYS.intervalMs],
  });
  const interval = settings[SCHEDULER_KEYS.intervalMs];
  return { enabled: true, intervalMs: interval ? Number(interval) : DEFAULT_INTERVAL_MS };
}

export async function resumeSchedulerIfEnabled(): Promise<SchedulerStatus | null> {
  const persisted = await getPersistedSchedulerState();
  if (!persisted?.enabled) return null;
  console.warn(`[Plex Scheduler] Auto-resuming with interval ${persisted.intervalMs}ms`);
  return startScheduler({ intervalMs: persisted.intervalMs });
}

/** Reset all scheduler state — for testing only. */
export function _resetScheduler(): void {
  isRunning = false;
  intervalMs = DEFAULT_INTERVAL_MS;
  nextSyncAt = null;
  movieSectionId = null;
  tvSectionId = null;
}

/** Directly write a sync log entry — for testing only. */
export function _writeSyncLog(record: SyncLogRecord): void {
  writeSyncLogImpl(record);
}
