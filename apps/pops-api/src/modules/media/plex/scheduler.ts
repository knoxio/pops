/**
 * Plex sync scheduler — periodic polling for new watch activity.
 *
 * Runs movie + TV sync at a configurable interval (default 1 hour).
 * Tracks sync timestamps and handles errors gracefully.
 * Persists state to the settings table so the scheduler can resume after restarts.
 */
import { eq } from "drizzle-orm";
import { settings } from "@pops/db-types";
import type { PlexClient } from "./client.js";
import { importMoviesFromPlex } from "./sync-movies.js";
import { importTvShowsFromPlex } from "./sync-tv.js";
import { getPlexClient, getPlexSectionIds } from "./service.js";
import { getDrizzle } from "../../../db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncRunResult {
  moviesSynced: number;
  moviesSkipped: number;
  movieErrors: number;
  tvShowsSynced: number;
  tvShowsSkipped: number;
  tvErrors: number;
  timestamp: string;
  error: string | null;
}

export interface SchedulerStatus {
  isRunning: boolean;
  intervalMs: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  nextSyncAt: string | null;
  moviesSynced: number;
  tvShowsSynced: number;
  lastSyncResult: SyncRunResult | null;
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
let movieSectionId: string | null = null;
let tvSectionId: string | null = null;
let lastSyncResult: SyncRunResult | null = null;

// ---------------------------------------------------------------------------
// Settings persistence helpers
// ---------------------------------------------------------------------------

function persistSchedulerState(enabled: boolean): void {
  try {
    const db = getDrizzle();
    const upsert = (key: string, value: string): void =>
      db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run();

    upsert("plex_scheduler_enabled", enabled ? "true" : "false");
    if (enabled) {
      upsert("plex_scheduler_interval_ms", String(intervalMs));
      if (movieSectionId) upsert("plex_scheduler_movie_section_id", movieSectionId);
      if (tvSectionId) upsert("plex_scheduler_tv_section_id", tvSectionId);
    }
  } catch (err) {
    console.error("[Plex Scheduler] Failed to persist state:", err);
  }
}

function persistSyncResult(result: SyncRunResult): void {
  try {
    const db = getDrizzle();
    db.insert(settings)
      .values({ key: "plex_last_sync_result", value: JSON.stringify(result) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(result) },
      })
      .run();
  } catch (err) {
    console.error("[Plex Scheduler] Failed to persist sync result:", err);
  }
}

/** Read persisted scheduler options from settings (for auto-resume). */
export function getPersistedSchedulerState(): {
  enabled: boolean;
  options: SchedulerOptions;
} {
  try {
    const db = getDrizzle();
    const get = (key: string): string | null =>
      db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;

    const enabled = get("plex_scheduler_enabled") === "true";
    const savedInterval = get("plex_scheduler_interval_ms");
    const savedMovie = get("plex_scheduler_movie_section_id");
    const savedTv = get("plex_scheduler_tv_section_id");

    return {
      enabled,
      options: {
        intervalMs: savedInterval ? Number(savedInterval) : undefined,
        movieSectionId: savedMovie ?? undefined,
        tvSectionId: savedTv ?? undefined,
      },
    };
  } catch {
    return { enabled: false, options: {} };
  }
}

/** Read persisted last sync result from settings. */
export function getPersistedSyncResult(): SyncRunResult | null {
  try {
    const db = getDrizzle();
    const record = db
      .select()
      .from(settings)
      .where(eq(settings.key, "plex_last_sync_result"))
      .get();
    if (!record) return null;
    return JSON.parse(record.value) as SyncRunResult;
  } catch {
    return null;
  }
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

  persistSchedulerState(true);
  return getSchedulerStatus();
}

/** Stop the periodic sync scheduler. No-op if not running. */
export function stopScheduler(): SchedulerStatus {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  nextSyncAt = null;
  persistSchedulerState(false);
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
    lastSyncResult,
  };
}

// ---------------------------------------------------------------------------
// Internal sync runner
// ---------------------------------------------------------------------------

async function runSync(): Promise<void> {
  const client = getPlexClient();
  if (!client) {
    lastSyncError = "Plex not configured (PLEX_URL or plex_token missing)";
    lastSyncAt = new Date().toISOString();
    nextSyncAt = timer ? new Date(Date.now() + intervalMs).toISOString() : null;

    const errorResult: SyncRunResult = {
      moviesSynced: 0,
      moviesSkipped: 0,
      movieErrors: 0,
      tvShowsSynced: 0,
      tvShowsSkipped: 0,
      tvErrors: 0,
      timestamp: lastSyncAt,
      error: lastSyncError,
    };
    lastSyncResult = errorResult;
    persistSyncResult(errorResult);
    return;
  }

  try {
    const result = await executeSyncCycle(client);
    lastSyncError = null;
    lastSyncResult = result;
    persistSyncResult(result);
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : String(err);
    const errorResult: SyncRunResult = {
      moviesSynced: 0,
      moviesSkipped: 0,
      movieErrors: 0,
      tvShowsSynced: 0,
      tvShowsSkipped: 0,
      tvErrors: 0,
      timestamp: new Date().toISOString(),
      error: lastSyncError,
    };
    lastSyncResult = errorResult;
    persistSyncResult(errorResult);
  }

  lastSyncAt = new Date().toISOString();
  nextSyncAt = timer ? new Date(Date.now() + intervalMs).toISOString() : null;
}

async function executeSyncCycle(client: PlexClient): Promise<SyncRunResult> {
  let mSynced = 0;
  let mSkipped = 0;
  let mErrors = 0;
  let tSynced = 0;
  let tSkipped = 0;
  let tErrors = 0;

  if (movieSectionId) {
    const movieResult = await importMoviesFromPlex(client, movieSectionId);
    mSynced = movieResult.synced;
    mSkipped = movieResult.skipped;
    mErrors = movieResult.errors.length;
    moviesSynced += movieResult.synced;
  } else {
    console.warn("[Plex Scheduler] Movie section ID not configured — skipping movie sync");
  }

  if (tvSectionId) {
    const tvResult = await importTvShowsFromPlex(client, tvSectionId);
    tSynced = tvResult.synced;
    tSkipped = tvResult.skipped;
    tErrors = tvResult.errors.length;
    tvShowsSynced += tvResult.synced;
  } else {
    console.warn("[Plex Scheduler] TV section ID not configured — skipping TV sync");
  }

  return {
    moviesSynced: mSynced,
    moviesSkipped: mSkipped,
    movieErrors: mErrors,
    tvShowsSynced: tSynced,
    tvShowsSkipped: tSkipped,
    tvErrors: tErrors,
    timestamp: new Date().toISOString(),
    error: null,
  };
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
  lastSyncResult = null;
}

/** Expose runSync for testing without waiting for interval. */
export async function _triggerSync(): Promise<void> {
  return runSync();
}
