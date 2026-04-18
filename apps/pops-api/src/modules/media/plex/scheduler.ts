import { desc, eq } from 'drizzle-orm';

/**
 * Plex sync scheduler — BullMQ repeatable job for periodic library polling.
 *
 * Public API is unchanged from the in-memory implementation:
 *   startScheduler / stopScheduler / getSchedulerStatus / resumeSchedulerIfEnabled
 *
 * The actual sync logic runs in the worker process (src/jobs/handlers/sync.ts).
 * This module manages the BullMQ job scheduler registration and provides
 * status information to the tRPC layer.
 *
 * PRD-074 US-05
 */
import { settings, syncLogs } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getSyncQueue } from '../../../jobs/queues.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';
import { getPlexSectionIds } from './service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** Sync interval in milliseconds. Default: 1 hour. */
  intervalMs?: number;
  /** Plex library section ID for movies. */
  movieSectionId?: string;
  /** Plex library section ID for TV shows. */
  tvSectionId?: string;
}

export interface SyncLogEntry {
  id: number;
  syncedAt: string;
  moviesSynced: number;
  tvShowsSynced: number;
  errors: string[] | null;
  durationMs: number | null;
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Stable ID used for the BullMQ job scheduler — deduplication key in Redis. */
const SCHEDULER_ID = 'pops-plex-scheduled-sync';

const SCHEDULER_KEYS = {
  enabled: SETTINGS_KEYS.PLEX_SCHEDULER_ENABLED,
  intervalMs: SETTINGS_KEYS.PLEX_SCHEDULER_INTERVAL_MS,
  movieSectionId: SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID,
  tvSectionId: SETTINGS_KEYS.PLEX_TV_SECTION_ID,
} as const;

// ---------------------------------------------------------------------------
// Module singleton state
// ---------------------------------------------------------------------------

let isRunning = false;
let intervalMs = DEFAULT_INTERVAL_MS;
let nextSyncAt: string | null = null;
let movieSectionId: string | null = null;
let tvSectionId: string | null = null;

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

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

function writeSyncLog(
  syncedAt: string,
  movieCount: number,
  tvCount: number,
  errors: string[] | null,
  durationMs: number | null
): void {
  const db = getDrizzle();
  db.insert(syncLogs)
    .values({
      syncedAt,
      moviesSynced: movieCount,
      tvShowsSynced: tvCount,
      errors: errors && errors.length > 0 ? JSON.stringify(errors) : null,
      durationMs,
    })
    .run();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Register a BullMQ repeatable job for periodic Plex sync. No-op if already running. */
export function startScheduler(options: SchedulerOptions = {}): SchedulerStatus {
  if (isRunning) return getSchedulerStatus();

  intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;

  const saved = getPlexSectionIds();
  movieSectionId = options.movieSectionId ?? saved.movieSectionId;
  tvSectionId = options.tvSectionId ?? saved.tvSectionId;

  nextSyncAt = new Date(Date.now() + intervalMs).toISOString();

  // Register (or update) the repeatable job in BullMQ.
  // upsertJobScheduler is idempotent — calling it with the same ID replaces any
  // existing scheduler rather than adding a duplicate.
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

/** Get current scheduler status. Last-sync info is read from the sync_logs table. */
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

/** Read persisted scheduler state from settings. Returns null when not previously enabled. */
export function getPersistedSchedulerState(): {
  enabled: boolean;
  intervalMs: number;
} | null {
  const enabled = getSetting(SCHEDULER_KEYS.enabled);
  if (enabled !== 'true') return null;
  const interval = getSetting(SCHEDULER_KEYS.intervalMs);
  return {
    enabled: true,
    intervalMs: interval ? Number(interval) : DEFAULT_INTERVAL_MS,
  };
}

/** Auto-resume the scheduler if it was previously running. Call this on server startup. */
export function resumeSchedulerIfEnabled(): SchedulerStatus | null {
  const persisted = getPersistedSchedulerState();
  if (!persisted?.enabled) return null;

  console.warn(`[Plex Scheduler] Auto-resuming with interval ${persisted.intervalMs}ms`);
  return startScheduler({ intervalMs: persisted.intervalMs });
}

/** Get recent sync log entries. */
export function getSyncLogs(limit = 20): SyncLogEntry[] {
  const db = getDrizzle();
  const rows = db.select().from(syncLogs).orderBy(desc(syncLogs.syncedAt)).limit(limit).all();
  return rows.map((row) => ({
    id: row.id,
    syncedAt: row.syncedAt,
    moviesSynced: row.moviesSynced,
    tvShowsSynced: row.tvShowsSynced,
    errors: row.errors ? (JSON.parse(row.errors) as string[]) : null,
    durationMs: row.durationMs,
  }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getLastSyncAt(): string | null {
  try {
    const db = getDrizzle();
    const row = db
      .select({ syncedAt: syncLogs.syncedAt })
      .from(syncLogs)
      .orderBy(desc(syncLogs.syncedAt))
      .limit(1)
      .get();
    return row?.syncedAt ?? null;
  } catch {
    return null;
  }
}

function getLastSyncCounts(): { moviesSynced: number; tvShowsSynced: number } {
  try {
    const db = getDrizzle();
    const row = db
      .select({ moviesSynced: syncLogs.moviesSynced, tvShowsSynced: syncLogs.tvShowsSynced })
      .from(syncLogs)
      .orderBy(desc(syncLogs.syncedAt))
      .limit(1)
      .get();
    return {
      moviesSynced: row?.moviesSynced ?? 0,
      tvShowsSynced: row?.tvShowsSynced ?? 0,
    };
  } catch {
    return { moviesSynced: 0, tvShowsSynced: 0 };
  }
}

function getLastSyncError(): string | null {
  try {
    const db = getDrizzle();
    const row = db
      .select({ errors: syncLogs.errors, syncedAt: syncLogs.syncedAt })
      .from(syncLogs)
      .orderBy(desc(syncLogs.syncedAt))
      .limit(1)
      .get();
    if (!row?.errors) return null;
    const errors = JSON.parse(row.errors) as string[];
    return errors.length > 0 ? (errors[0] ?? null) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset all scheduler state — for testing only. */
export function _resetScheduler(): void {
  isRunning = false;
  intervalMs = DEFAULT_INTERVAL_MS;
  nextSyncAt = null;
  movieSectionId = null;
  tvSectionId = null;
}

/** Directly write a sync log entry — for testing only. */
export function _writeSyncLog(
  syncedAt: string,
  movieCount: number,
  tvCount: number,
  errors: string[] | null,
  durationMs: number | null
): void {
  writeSyncLog(syncedAt, movieCount, tvCount, errors, durationMs);
}

/** Re-export for external use (e.g., the rotation scheduler). */
export { writeSyncLog };
