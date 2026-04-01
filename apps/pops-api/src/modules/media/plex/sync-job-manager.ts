/**
 * Sync job manager — runs sync operations in the background and tracks
 * progress in memory. Persists completed results to SQLite.
 *
 * This is the core of the background sync system. The tRPC router starts
 * jobs via startJob() (returns immediately), and the frontend polls for
 * progress via getJob(). Completed results survive page navigation via
 * the sync_job_results SQLite table.
 */
import { randomUUID } from "node:crypto";
import { eq, desc, sql } from "drizzle-orm";
import { syncJobResults } from "@pops/db-types";
import type { PlexClient } from "./client.js";
import { getPlexClient, getPlexToken } from "./service.js";
import { importMoviesFromPlex } from "./sync-movies.js";
import { importTvShowsFromPlex } from "./sync-tv.js";
import { syncWatchlistFromPlex } from "./sync-watchlist.js";
import { syncWatchHistoryFromPlex } from "./sync-watch-history.js";
import { syncDiscoverWatches } from "./sync-discover-watches.js";
import { getDrizzle } from "../../../db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const SYNC_JOB_TYPES = [
  "syncMovies",
  "syncTvShows",
  "syncWatchlist",
  "syncWatchHistory",
  "syncDiscoverWatches",
] as const;

export type SyncJobType = (typeof SYNC_JOB_TYPES)[number];

export interface SyncJobProgress {
  processed: number;
  total: number;
}

export interface SyncJob {
  id: string;
  jobType: SyncJobType;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  progress: SyncJobProgress;
  result: unknown;
  error: string | null;
}

export interface SyncJobParams {
  sectionId?: string;
  movieSectionId?: string;
  tvSectionId?: string;
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const activeJobs = new Map<string, SyncJob>();

/** Grace period before removing completed jobs from memory (5 min). */
const CLEANUP_DELAY_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a background sync job. Returns immediately with the job ID.
 * Throws if a job of the same type is already running.
 */
export function startJob(jobType: SyncJobType, params: SyncJobParams): string {
  // Check for duplicate
  for (const job of activeJobs.values()) {
    if (job.jobType === jobType && job.status === "running") {
      throw new Error(`A ${jobType} sync is already running (job ${job.id})`);
    }
  }

  const id = randomUUID();
  const job: SyncJob = {
    id,
    jobType,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    progress: { processed: 0, total: 0 },
    result: null,
    error: null,
  };

  activeJobs.set(id, job);

  // Fire and forget — do not await
  void runJob(id, jobType, params);

  return id;
}

/** Get a job by ID. Checks memory first, falls back to SQLite. */
export function getJob(jobId: string): SyncJob | null {
  const inMemory = activeJobs.get(jobId);
  if (inMemory) return inMemory;

  // Fall back to SQLite for completed jobs
  const db = getDrizzle();
  const row = db.select().from(syncJobResults).where(eq(syncJobResults.id, jobId)).get();
  if (!row) return null;

  return rowToSyncJob(row);
}

/** Get all currently active (in-memory) jobs. */
export function getActiveJobs(): SyncJob[] {
  return [...activeJobs.values()];
}

/** Check if a job of the given type is currently running. */
export function isJobRunning(jobType: SyncJobType): boolean {
  for (const job of activeJobs.values()) {
    if (job.jobType === jobType && job.status === "running") return true;
  }
  return false;
}

/**
 * Get the most recent completed job for each sync type.
 * Used for "last synced" display.
 */
export function getLastCompletedJobs(): Record<string, SyncJob | null> {
  const db = getDrizzle();
  const result: Record<string, SyncJob | null> = {};

  for (const jobType of SYNC_JOB_TYPES) {
    const row = db
      .select()
      .from(syncJobResults)
      .where(eq(syncJobResults.jobType, jobType))
      .orderBy(desc(syncJobResults.completedAt))
      .limit(1)
      .get();

    result[jobType] = row ? rowToSyncJob(row) : null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal: job runner
// ---------------------------------------------------------------------------

async function runJob(jobId: string, jobType: SyncJobType, params: SyncJobParams): Promise<void> {
  const job = activeJobs.get(jobId);
  if (!job) return;

  const startTime = Date.now();

  try {
    const result = await executeSyncByType(jobId, jobType, params, (progress) => {
      job.progress = progress;
    });

    job.status = "completed";
    job.result = result;
    job.completedAt = new Date().toISOString();
    job.durationMs = Date.now() - startTime;

    persistJobResult(job);
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    job.completedAt = new Date().toISOString();
    job.durationMs = Date.now() - startTime;

    persistJobResult(job);
  } finally {
    // Keep in memory for a grace period so the UI can poll the final state
    setTimeout(() => activeJobs.delete(jobId), CLEANUP_DELAY_MS);
  }
}

async function executeSyncByType(
  jobId: string,
  jobType: SyncJobType,
  params: SyncJobParams,
  onProgress: (progress: SyncJobProgress) => void
): Promise<unknown> {
  const client = requirePlexClient();

  switch (jobType) {
    case "syncMovies": {
      if (!params.sectionId) throw new Error("sectionId is required for movie sync");
      return importMoviesFromPlex(client, params.sectionId, {
        onProgress: (p) => onProgress({ processed: p.processed, total: p.total }),
      });
    }
    case "syncTvShows": {
      if (!params.sectionId) throw new Error("sectionId is required for TV sync");
      return importTvShowsFromPlex(client, params.sectionId, {
        onProgress: (p) => onProgress({ processed: p.processed, total: p.total }),
      });
    }
    case "syncWatchlist": {
      const token = getPlexToken();
      if (!token) throw new Error("Plex token not available");
      return syncWatchlistFromPlex(token, {
        onProgress: (p) => onProgress({ processed: p.processed, total: p.total }),
      });
    }
    case "syncWatchHistory": {
      return syncWatchHistoryFromPlex(
        client,
        params.movieSectionId,
        params.tvSectionId,
        (processed, total) => onProgress({ processed, total })
      );
    }
    case "syncDiscoverWatches": {
      const job = activeJobs.get(jobId);
      return syncDiscoverWatches(
        client,
        (processed, total) => onProgress({ processed, total }),
        (partialResult) => {
          if (job) job.result = partialResult;
        }
      );
    }
  }
}

function requirePlexClient(): PlexClient {
  const client = getPlexClient();
  if (!client) throw new Error("Plex is not configured");
  return client;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persistJobResult(job: SyncJob): void {
  try {
    const db = getDrizzle();
    db.insert(syncJobResults)
      .values({
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        durationMs: job.durationMs,
        progress: JSON.stringify(job.progress),
        result: job.result ? JSON.stringify(job.result) : null,
        error: job.error,
      })
      .run();

    // Keep only the last 50 results to prevent unbounded growth
    db.run(sql`
      DELETE FROM sync_job_results
      WHERE id NOT IN (
        SELECT id FROM sync_job_results ORDER BY completed_at DESC LIMIT 50
      )
    `);
  } catch (err) {
    console.error("[SyncJobManager] Failed to persist job result:", err);
  }
}

function rowToSyncJob(row: typeof syncJobResults.$inferSelect): SyncJob {
  return {
    id: row.id,
    jobType: row.jobType as SyncJobType,
    status: row.status as "completed" | "failed",
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    durationMs: row.durationMs ?? null,
    progress: row.progress
      ? (JSON.parse(row.progress) as SyncJobProgress)
      : { processed: 0, total: 0 },
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error ?? null,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset all job state. For testing only. */
export function _resetJobs(): void {
  activeJobs.clear();
}
