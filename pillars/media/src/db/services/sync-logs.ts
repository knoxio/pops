/**
 * `sync_logs` persistence for the periodic Plex sync scheduler (slice 9c).
 *
 * One row is written per scheduler tick: the counts of movies/tv shows
 * synced, an optional JSON-encoded array of error strings, and the tick
 * duration. The scheduler controller (`src/api/cron/plex-scheduler.ts`)
 * reads the last row to surface `getSchedulerStatus`.
 *
 * Services take a `MediaDb` handle as their first argument and are
 * HTTP-free; the api layer resolves the handle. Mirrors the other media
 * services' `(db, …)` signature.
 */
import { desc } from 'drizzle-orm';

import { syncLogs } from '../schema.js';

import type { MediaDb } from './internal.js';

/** A persisted sync-log row in the typed shape handlers + status consume. */
export interface SyncLogEntry {
  id: number;
  syncedAt: string;
  moviesSynced: number;
  tvShowsSynced: number;
  errors: string[] | null;
  durationMs: number | null;
}

export interface WriteSyncLogInput {
  syncedAt: string;
  moviesSynced: number;
  tvShowsSynced: number;
  errors: string[] | null;
  durationMs: number | null;
}

function parseErrors(raw: string | null): string[] | null {
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.map(String) : null;
}

export function writeSyncLog(db: MediaDb, input: WriteSyncLogInput): void {
  const { syncedAt, moviesSynced, tvShowsSynced, errors, durationMs } = input;
  db.insert(syncLogs)
    .values({
      syncedAt,
      moviesSynced,
      tvShowsSynced,
      errors: errors && errors.length > 0 ? JSON.stringify(errors) : null,
      durationMs,
    })
    .run();
}

export function listSyncLogs(db: MediaDb, limit = 20): SyncLogEntry[] {
  const rows = db.select().from(syncLogs).orderBy(desc(syncLogs.syncedAt)).limit(limit).all();
  return rows.map((row) => ({
    id: row.id,
    syncedAt: row.syncedAt,
    moviesSynced: row.moviesSynced,
    tvShowsSynced: row.tvShowsSynced,
    errors: parseErrors(row.errors),
    durationMs: row.durationMs,
  }));
}

function lastRow(db: MediaDb): SyncLogEntry | null {
  const rows = listSyncLogs(db, 1);
  return rows[0] ?? null;
}

export function getLastSyncAt(db: MediaDb): string | null {
  return lastRow(db)?.syncedAt ?? null;
}

export function getLastSyncCounts(db: MediaDb): { moviesSynced: number; tvShowsSynced: number } {
  const row = lastRow(db);
  return {
    moviesSynced: row?.moviesSynced ?? 0,
    tvShowsSynced: row?.tvShowsSynced ?? 0,
  };
}

export function getLastSyncError(db: MediaDb): string | null {
  const errors = lastRow(db)?.errors;
  if (!errors || errors.length === 0) return null;
  return errors[0] ?? null;
}
