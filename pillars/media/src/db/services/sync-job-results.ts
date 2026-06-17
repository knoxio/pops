/**
 * `sync_job_results` CRUD against the media pillar's SQLite via drizzle.
 *
 * Backs the in-process Plex sync job runner (slice 9b). The monolith
 * persisted job state in BullMQ + a `sync_job_results` mirror table; the
 * pillar has no Redis/BullMQ, so this table is the single source of truth
 * for job status. `progress` and `result` are stored as JSON strings; this
 * service parses/serialises them so callers work with typed values.
 *
 * Services take a `MediaDb` handle as their first argument and are
 * HTTP-free; the calling layer (`src/api/clients/plex/sync/`) resolves the
 * handle. Mirrors the other media services' `(db, …)` signature.
 */
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import { syncJobResults } from '../schema.js';

import type { MediaDb } from './internal.js';

/** Raw drizzle row shape — the persisted sync_job_results record. */
export type SyncJobResultRow = typeof syncJobResults.$inferSelect;

export type SyncJobStatus = 'running' | 'completed' | 'failed';

export interface SyncJobProgress {
  processed: number;
  total: number;
}

/** A sync job in the typed shape the handlers + FE consume. */
export interface SyncJob {
  id: string;
  jobType: string;
  status: SyncJobStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  progress: SyncJobProgress;
  result: unknown;
  error: string | null;
}

export interface InsertSyncJobInput {
  id: string;
  jobType: string;
  status: SyncJobStatus;
  startedAt: string;
  progress?: SyncJobProgress | undefined;
}

export interface UpdateSyncJobInput {
  status?: SyncJobStatus;
  completedAt?: string;
  durationMs?: number;
  progress?: SyncJobProgress;
  result?: unknown;
  error?: string;
}

function parseProgress(raw: string | null): SyncJobProgress {
  if (!raw) return { processed: 0, total: 0 };
  try {
    return JSON.parse(raw) as SyncJobProgress;
  } catch {
    return { processed: 0, total: 0 };
  }
}

function isSyncJobStatus(value: string): value is SyncJobStatus {
  return value === 'running' || value === 'completed' || value === 'failed';
}

/** Map a raw row to the typed {@link SyncJob}, JSON-parsing progress + result. */
export function rowToSyncJob(row: SyncJobResultRow): SyncJob {
  return {
    id: row.id,
    jobType: row.jobType,
    status: isSyncJobStatus(row.status) ? row.status : 'failed',
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    durationMs: row.durationMs ?? null,
    progress: parseProgress(row.progress),
    result: row.result ? (JSON.parse(row.result) as unknown) : null,
    error: row.error ?? null,
  };
}

/** Insert a new job row. Caller supplies the (uuid) id. */
export function insertSyncJobResult(db: MediaDb, input: InsertSyncJobInput): void {
  db.insert(syncJobResults)
    .values({
      id: input.id,
      jobType: input.jobType,
      status: input.status,
      startedAt: input.startedAt,
      progress: input.progress ? JSON.stringify(input.progress) : null,
    })
    .run();
}

/** Patch a job row by id. Only the provided fields are written. */
export function updateSyncJobResult(db: MediaDb, id: string, input: UpdateSyncJobInput): void {
  const updates: Partial<typeof syncJobResults.$inferInsert> = {};
  if (input.status !== undefined) updates.status = input.status;
  if (input.completedAt !== undefined) updates.completedAt = input.completedAt;
  if (input.durationMs !== undefined) updates.durationMs = input.durationMs;
  if (input.progress !== undefined) updates.progress = JSON.stringify(input.progress);
  if (input.result !== undefined) updates.result = JSON.stringify(input.result);
  if (input.error !== undefined) updates.error = input.error;
  if (Object.keys(updates).length === 0) return;
  db.update(syncJobResults).set(updates).where(eq(syncJobResults.id, id)).run();
}

/** Read a single job by id, or `null` when absent. */
export function getSyncJobResult(db: MediaDb, id: string): SyncJob | null {
  const row = db.select().from(syncJobResults).where(eq(syncJobResults.id, id)).get();
  return row ? rowToSyncJob(row) : null;
}

/** Every currently-running job (`status = 'running'`), newest first. */
export function listActive(db: MediaDb): SyncJob[] {
  return db
    .select()
    .from(syncJobResults)
    .where(eq(syncJobResults.status, 'running'))
    .orderBy(desc(syncJobResults.startedAt))
    .all()
    .map(rowToSyncJob);
}

/**
 * The most recent COMPLETED job for each of `jobTypes` ("last synced"
 * display). Missing types map to `null`.
 */
export function lastByType(
  db: MediaDb,
  jobTypes: readonly string[]
): Record<string, SyncJob | null> {
  const out: Record<string, SyncJob | null> = {};
  for (const jobType of jobTypes) {
    const row = db
      .select()
      .from(syncJobResults)
      .where(
        and(
          eq(syncJobResults.jobType, jobType),
          eq(syncJobResults.status, 'completed'),
          isNotNull(syncJobResults.completedAt)
        )
      )
      .orderBy(desc(syncJobResults.completedAt), desc(syncJobResults.startedAt))
      .limit(1)
      .get();
    out[jobType] = row ? rowToSyncJob(row) : null;
  }
  return out;
}
