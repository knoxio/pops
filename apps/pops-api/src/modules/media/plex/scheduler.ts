/**
 * Plex sync scheduler — periodic polling for new watch activity.
 *
 * Runs movie + TV sync at a configurable interval (default 1 hour).
 * Tracks sync timestamps and handles errors gracefully.
 * Persists scheduler config and sync logs to the settings table.
 */
import { settings, syncLogs } from '@pops/db-types';
import { desc, eq } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import type { PlexClient } from './client.js';
import { getPlexClient, getPlexSectionIds, getPlexToken } from './service.js';
import { isJobRunning } from './sync-job-manager.js';
import { importMoviesFromPlex } from './sync-movies.js';
import { importTvShowsFromPlex } from './sync-tv.js';
import { syncWatchlistFromPlex } from './sync-watchlist.js';

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
  /** Plex library section ID for movies. Default: "1". */
  movieSectionId?: string;
  /** Plex library section ID for TV shows. Default: "2". */
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

// Settings keys for scheduler persistence
const SETTINGS_KEYS = {
  enabled: 'plex_scheduler_enabled',
  intervalMs: 'plex_scheduler_interval_ms',
  movieSectionId: 'plex_movie_section_id',
  tvSectionId: 'plex_tv_section_id',
} as const;

// ---------------------------------------------------------------------------
// Scheduler state (module singleton)
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;
let intervalMs = DEFAULT_INTERVAL_MS;
let lastSyncAt: string | null = null;
let lastSyncError: string | null = null;
let nextSyncAt: string | null = null;
let moviesSynced = 0;
let tvShowsSynced = 0;
let movieSectionId: string | null = null;
let tvSectionId: string | null = null;

// ---------------------------------------------------------------------------
// Settings persistence helpers
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
  saveSetting(SETTINGS_KEYS.enabled, 'true');
  saveSetting(SETTINGS_KEYS.intervalMs, String(intervalMs));
}

function clearSchedulerConfig(): void {
  deleteSetting(SETTINGS_KEYS.enabled);
  deleteSetting(SETTINGS_KEYS.intervalMs);
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

/** Start the periodic sync scheduler. No-op if already running. */
export function startScheduler(options: SchedulerOptions = {}): SchedulerStatus {
  if (timer) {
    return getSchedulerStatus();
  }

  intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;

  // Use explicit options, then saved settings, then null (will skip sync)
  const saved = getPlexSectionIds();
  movieSectionId = options.movieSectionId ?? saved.movieSectionId;
  tvSectionId = options.tvSectionId ?? saved.tvSectionId;

  // Schedule next sync
  nextSyncAt = new Date(Date.now() + intervalMs).toISOString();
  timer = setInterval(() => {
    void runSync();
  }, intervalMs);

  // Persist config so scheduler auto-resumes on restart
  persistSchedulerConfig();

  return getSchedulerStatus();
}

/** Stop the periodic sync scheduler. No-op if not running. */
export function stopScheduler(): SchedulerStatus {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  nextSyncAt = null;

  // Clear persisted config so scheduler doesn't auto-resume
  clearSchedulerConfig();

  return getSchedulerStatus();
}

/** Get current scheduler status. */
export function getSchedulerStatus(): SchedulerStatus {
  return {
    isRunning: timer !== null,
    intervalMs,
    lastSyncAt,
    lastSyncError,
    nextSyncAt,
    moviesSynced,
    tvShowsSynced,
  };
}

/**
 * Read persisted scheduler state from settings.
 * Returns null if the scheduler was not previously enabled.
 */
export function getPersistedSchedulerState(): {
  enabled: boolean;
  intervalMs: number;
} | null {
  const enabled = getSetting(SETTINGS_KEYS.enabled);
  if (enabled !== 'true') return null;
  const interval = getSetting(SETTINGS_KEYS.intervalMs);
  return {
    enabled: true,
    intervalMs: interval ? Number(interval) : DEFAULT_INTERVAL_MS,
  };
}

/**
 * Auto-resume the scheduler if it was previously running.
 * Call this on server startup.
 */
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
// Internal sync runner
// ---------------------------------------------------------------------------

async function runSync(): Promise<void> {
  const client = getPlexClient();
  if (!client) {
    lastSyncError = 'Plex not configured (PLEX_URL or plex_token missing)';
    lastSyncAt = new Date().toISOString();
    nextSyncAt = timer ? new Date(Date.now() + intervalMs).toISOString() : null;
    writeSyncLog(lastSyncAt, 0, 0, [lastSyncError], null);
    return;
  }

  const startTime = Date.now();
  try {
    const result = await executeSyncCycle(client);
    lastSyncError = null;
    lastSyncAt = new Date().toISOString();
    nextSyncAt = timer ? new Date(Date.now() + intervalMs).toISOString() : null;

    writeSyncLog(
      lastSyncAt,
      result.movieCount,
      result.tvCount,
      result.errors.length > 0 ? result.errors : null,
      Date.now() - startTime
    );
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : String(err);
    lastSyncAt = new Date().toISOString();
    nextSyncAt = timer ? new Date(Date.now() + intervalMs).toISOString() : null;

    writeSyncLog(lastSyncAt, 0, 0, [lastSyncError], Date.now() - startTime);
  }
}

async function executeSyncCycle(
  client: PlexClient
): Promise<{ movieCount: number; tvCount: number; watchlistAdded: number; errors: string[] }> {
  let movieCount = 0;
  let tvCount = 0;
  let watchlistAdded = 0;
  const errors: string[] = [];

  if (movieSectionId) {
    if (isJobRunning('syncMovies')) {
      console.warn('[Plex Scheduler] Skipping movie sync — manual job in progress');
    } else {
      const movieResult = await importMoviesFromPlex(client, movieSectionId);
      movieCount = movieResult.synced;
      moviesSynced += movieResult.synced;
      for (const err of movieResult.errors) {
        errors.push(`Movie: ${err.title} — ${err.reason}`);
      }
    }
  } else {
    console.warn('[Plex Scheduler] Movie section ID not configured — skipping movie sync');
  }

  if (tvSectionId) {
    if (isJobRunning('syncTvShows')) {
      console.warn('[Plex Scheduler] Skipping TV sync — manual job in progress');
    } else {
      const tvResult = await importTvShowsFromPlex(client, tvSectionId);
      tvCount = tvResult.synced;
      tvShowsSynced += tvResult.synced;
      for (const err of tvResult.errors) {
        errors.push(`TV: ${err.title} — ${err.reason}`);
      }
    }
  } else {
    console.warn('[Plex Scheduler] TV section ID not configured — skipping TV sync');
  }

  // Watchlist sync runs after library sync (items may need to be added to library first)
  const token = getPlexToken();
  if (token) {
    if (isJobRunning('syncWatchlist')) {
      console.warn('[Plex Scheduler] Skipping watchlist sync — manual job in progress');
    } else {
      try {
        const watchlistResult = await syncWatchlistFromPlex(token);
        watchlistAdded = watchlistResult.added;
        for (const err of watchlistResult.errors) {
          errors.push(`Watchlist: ${err.title} — ${err.reason}`);
        }
      } catch (err) {
        errors.push(`Watchlist sync failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { movieCount, tvCount, watchlistAdded, errors };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset all scheduler state — for testing only. */
export function _resetScheduler(): void {
  stopScheduler();
  lastSyncAt = null;
  lastSyncError = null;
  nextSyncAt = null;
  moviesSynced = 0;
  tvShowsSynced = 0;
  movieSectionId = null;
  tvSectionId = null;
  intervalMs = DEFAULT_INTERVAL_MS;
}

/** Expose runSync for testing without waiting for interval. */
export async function _triggerSync(): Promise<void> {
  return runSync();
}
