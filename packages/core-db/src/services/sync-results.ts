/**
 * BullMQ sync-job result persistence against the core pillar's SQLite.
 *
 * Mirrors the structure used by every other core service in this package:
 * the function takes a `CoreDb` handle as its first argument and performs
 * a single UPSERT against `sync_job_results`. The caller (the pops-api
 * worker queue handler) resolves the appropriate drizzle handle.
 *
 * Per `docs/themes/13-pillar-finale/notes/infra-hot-path-migration.md`
 * row 4 the `sync_job_results` table is a cross-pillar BullMQ result table
 * owned by the core pillar (lives next to `pillarRegistry`). This module
 * is the SDK surface for that ownership; the physical table cutover from
 * the shared `pops.db` into `core.db` lands with the PRD-186 sibling PR.
 *
 * Only the five Plex sync job types are persisted today — the
 * caller-side filter is preserved as `PERSISTED_SYNC_TYPES` so consumers
 * can short-circuit before constructing the row payload.
 */
import { syncJobResults } from '../schema.js';

import type { CoreDb } from './internal.js';

/**
 * Job type identifiers whose terminal state is mirrored into
 * `sync_job_results` for the dashboard's sync history view. All other
 * BullMQ jobs are observed only via Redis and never reach the table.
 */
export const PERSISTED_SYNC_TYPES: ReadonlySet<string> = new Set([
  'plexSyncMovies',
  'plexSyncTvShows',
  'plexSyncWatchlist',
  'plexSyncWatchHistory',
  'plexSyncDiscoverWatches',
]);

/** Single-call payload describing a job's terminal outcome. */
export interface PersistSyncResultInput {
  /** BullMQ job id. Used as the primary key. */
  readonly id: string;
  /** The BullMQ job type. Must be one of {@link PERSISTED_SYNC_TYPES}. */
  readonly jobType: string;
  /** Terminal status. */
  readonly status: 'completed' | 'failed';
  /** ISO-8601 timestamp the job started running. */
  readonly startedAt: string;
  /** ISO-8601 timestamp the job reached a terminal state. */
  readonly completedAt: string;
  /** End-to-end duration in milliseconds, or `null` if either bound is unknown. */
  readonly durationMs: number | null;
  /** JSON-encoded progress snapshot at completion (`{ processed, total }`). */
  readonly progressJson: string;
  /** JSON-encoded result payload (shape varies by jobType). `null` on failure. */
  readonly resultJson: string | null;
  /** Failure message, or `null` on success. */
  readonly error: string | null;
}

/**
 * UPSERT a terminal sync-job result row. Idempotent — replays of the
 * same `id` overwrite the mutable columns and leave the primary key
 * stable so the dashboard's `ORDER BY completed_at DESC` query reflects
 * the latest run.
 */
export function persist(db: CoreDb, input: PersistSyncResultInput): void {
  const {
    id,
    jobType,
    status,
    startedAt,
    completedAt,
    durationMs,
    progressJson,
    resultJson,
    error,
  } = input;

  db.insert(syncJobResults)
    .values({
      id,
      jobType,
      status,
      startedAt,
      completedAt,
      durationMs,
      progress: progressJson,
      result: resultJson,
      error,
    })
    .onConflictDoUpdate({
      target: syncJobResults.id,
      set: {
        status,
        completedAt,
        durationMs,
        progress: progressJson,
        result: resultJson,
        error,
      },
    })
    .run();
}
