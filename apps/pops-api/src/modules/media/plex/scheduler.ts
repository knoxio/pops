import { eq } from 'drizzle-orm';

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
import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getSyncQueue } from '../../../jobs/queues.js';
import { isEnabled } from '../../core/features/index.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';
import { getLastSyncAt, getLastSyncCounts, getLastSyncError } from './scheduler-sync-logs.js';
import { getPlexSectionIds } from './service.js';

function isPlexSchedulerEnabled(): boolean {
  return isEnabled('media.plex.scheduler');
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

let isRunning = false;
let intervalMs = DEFAULT_INTERVAL_MS;
let nextSyncAt: string | null = null;
let movieSectionId: string | null = null;
let tvSectionId: string | null = null;

function saveSetting(key: string, value: string): void {
  const db = getDrizzle();
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

function getSetting(key: string): string | null {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, key)).get();
  return record?.value ?? null;
}

function deleteSetting(key: string): void {
  const db = getDrizzle();
  db.delete(settings).where(eq(settings.key, key)).run();
}

function persistSchedulerConfig(): void {
  saveSetting(SCHEDULER_KEYS.enabled, 'true');
  saveSetting(SCHEDULER_KEYS.intervalMs, String(intervalMs));
}

function clearSchedulerConfig(): void {
  deleteSetting(SCHEDULER_KEYS.enabled);
  deleteSetting(SCHEDULER_KEYS.intervalMs);
}

/** Register a BullMQ repeatable job for periodic Plex sync. No-op if already running. */
export function startScheduler(options: SchedulerOptions = {}): SchedulerStatus {
  if (isRunning) return getSchedulerStatus();

  intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const saved = getPlexSectionIds();
  movieSectionId = options.movieSectionId ?? saved.movieSectionId;
  tvSectionId = options.tvSectionId ?? saved.tvSectionId;
  nextSyncAt = new Date(Date.now() + intervalMs).toISOString();

  void getSyncQueue()
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

  isRunning = true;
  persistSchedulerConfig();
  return getSchedulerStatus();
}

/** Remove the BullMQ repeatable job and stop the scheduler. */
export function stopScheduler(): SchedulerStatus {
  if (isRunning) {
    void getSyncQueue()
      .removeJobScheduler(SCHEDULER_ID)
      .catch((err: unknown) => {
        console.error('[Plex Scheduler] Failed to remove BullMQ scheduler:', err);
      });
  }
  isRunning = false;
  nextSyncAt = null;
  clearSchedulerConfig();
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

export function getPersistedSchedulerState(): { enabled: boolean; intervalMs: number } | null {
  if (!isPlexSchedulerEnabled()) return null;
  const interval = getSetting(SCHEDULER_KEYS.intervalMs);
  return { enabled: true, intervalMs: interval ? Number(interval) : DEFAULT_INTERVAL_MS };
}

export function resumeSchedulerIfEnabled(): SchedulerStatus | null {
  const persisted = getPersistedSchedulerState();
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
