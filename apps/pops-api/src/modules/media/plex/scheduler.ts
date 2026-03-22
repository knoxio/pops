/**
 * Plex sync scheduler — periodic polling for new watch activity.
 *
 * Runs movie + TV sync at a configurable interval (default 1 hour).
 * Tracks sync timestamps and handles errors gracefully.
 */
import type { PlexClient } from "./client.js";
import { importMoviesFromPlex } from "./sync-movies.js";
import { importTvShowsFromPlex } from "./sync-tv.js";
import { getPlexClient } from "./service.js";

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

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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
let movieSectionId = "1";
let tvSectionId = "2";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start the periodic sync scheduler. No-op if already running. */
export function startScheduler(options: SchedulerOptions = {}): SchedulerStatus {
  if (timer) {
    return getSchedulerStatus();
  }

  intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  movieSectionId = options.movieSectionId ?? "1";
  tvSectionId = options.tvSectionId ?? "2";

  // Schedule next sync
  nextSyncAt = new Date(Date.now() + intervalMs).toISOString();
  timer = setInterval(() => {
    void runSync();
  }, intervalMs);

  return getSchedulerStatus();
}

/** Stop the periodic sync scheduler. No-op if not running. */
export function stopScheduler(): SchedulerStatus {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  nextSyncAt = null;
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

// ---------------------------------------------------------------------------
// Internal sync runner
// ---------------------------------------------------------------------------

async function runSync(): Promise<void> {
  const client = getPlexClient();
  if (!client) {
    lastSyncError = "Plex not configured (PLEX_URL/PLEX_TOKEN missing)";
    lastSyncAt = new Date().toISOString();
    nextSyncAt = timer ? new Date(Date.now() + intervalMs).toISOString() : null;
    return;
  }

  try {
    await executeSyncCycle(client);
    lastSyncError = null;
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : String(err);
  }

  lastSyncAt = new Date().toISOString();
  nextSyncAt = timer ? new Date(Date.now() + intervalMs).toISOString() : null;
}

async function executeSyncCycle(client: PlexClient): Promise<void> {
  const movieResult = await importMoviesFromPlex(client, movieSectionId);
  moviesSynced += movieResult.synced;

  const tvResult = await importTvShowsFromPlex(client, tvSectionId);
  tvShowsSynced += tvResult.synced;
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
  movieSectionId = "1";
  tvSectionId = "2";
  intervalMs = DEFAULT_INTERVAL_MS;
}

/** Expose runSync for testing without waiting for interval. */
export async function _triggerSync(): Promise<void> {
  return runSync();
}
