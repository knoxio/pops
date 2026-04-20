import { desc } from 'drizzle-orm';

import { syncLogs } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

export interface SyncLogEntry {
  id: number;
  syncedAt: string;
  moviesSynced: number;
  tvShowsSynced: number;
  errors: string[] | null;
  durationMs: number | null;
}

export interface SyncLogRecord {
  syncedAt: string;
  movieCount: number;
  tvCount: number;
  errors: string[] | null;
  durationMs: number | null;
}

export function writeSyncLog(record: SyncLogRecord): void {
  const { syncedAt, movieCount, tvCount, errors, durationMs } = record;
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

export function getLastSyncAt(): string | null {
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

export function getLastSyncCounts(): { moviesSynced: number; tvShowsSynced: number } {
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

export function getLastSyncError(): string | null {
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
