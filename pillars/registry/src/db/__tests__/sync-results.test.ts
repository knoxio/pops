/**
 * Invariant tests for the sync-results service against an in-memory
 * SQLite seeded with the `sync_job_results` schema inline (the canonical
 * shape, kept in sync with migration 0060_sync_job_results.sql).
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { syncJobResults } from '../schema.js';
import {
  PERSISTED_SYNC_TYPES,
  persist,
  type PersistSyncResultInput,
} from '../services/sync-results.js';

import type { CoreDb } from '../services/internal.js';

const CREATE_TABLE_SQL = `
  CREATE TABLE sync_job_results (
    id text PRIMARY KEY NOT NULL,
    job_type text NOT NULL,
    status text NOT NULL,
    started_at text NOT NULL,
    completed_at text,
    duration_ms integer,
    progress text,
    result text,
    error text,
    created_at text NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_sync_job_results_type_completed ON sync_job_results (job_type, completed_at);
`;

function freshDb(): CoreDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(CREATE_TABLE_SQL);
  return drizzle(raw);
}

function baseInput(overrides: Partial<PersistSyncResultInput> = {}): PersistSyncResultInput {
  return {
    id: 'job-1',
    jobType: 'plexSyncMovies',
    status: 'completed',
    startedAt: '2026-06-01T10:00:00.000Z',
    completedAt: '2026-06-01T10:00:30.000Z',
    durationMs: 30_000,
    progressJson: JSON.stringify({ processed: 10, total: 10 }),
    resultJson: JSON.stringify({ added: 5, updated: 5 }),
    error: null,
    ...overrides,
  };
}

describe('PERSISTED_SYNC_TYPES', () => {
  it('contains the Plex sync job types', () => {
    expect([...PERSISTED_SYNC_TYPES].toSorted()).toEqual([
      'plexSyncDiscoverWatches',
      'plexSyncMovies',
      'plexSyncTvShows',
      'plexSyncWatchHistory',
      'plexSyncWatchlist',
    ]);
  });
});

describe('persist', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a completed row with the supplied fields', () => {
    persist(db, baseInput());
    const row = db.select().from(syncJobResults).where(eq(syncJobResults.id, 'job-1')).get();
    expect(row).toMatchObject({
      id: 'job-1',
      jobType: 'plexSyncMovies',
      status: 'completed',
      startedAt: '2026-06-01T10:00:00.000Z',
      completedAt: '2026-06-01T10:00:30.000Z',
      durationMs: 30_000,
      progress: JSON.stringify({ processed: 10, total: 10 }),
      result: JSON.stringify({ added: 5, updated: 5 }),
      error: null,
    });
  });

  it('inserts a failed row with the error message and null result', () => {
    persist(db, baseInput({ status: 'failed', error: 'boom', resultJson: null }));
    const row = db.select().from(syncJobResults).where(eq(syncJobResults.id, 'job-1')).get();
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('boom');
    expect(row?.result).toBeNull();
  });

  it('upserts on the second call with the same id (overwrites status + result)', () => {
    persist(db, baseInput({ status: 'failed', error: 'transient', resultJson: null }));
    persist(
      db,
      baseInput({
        status: 'completed',
        error: null,
        resultJson: JSON.stringify({ added: 1 }),
        completedAt: '2026-06-01T10:00:45.000Z',
        durationMs: 45_000,
      })
    );
    const rows = db.select().from(syncJobResults).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'job-1',
      status: 'completed',
      error: null,
      completedAt: '2026-06-01T10:00:45.000Z',
      durationMs: 45_000,
      result: JSON.stringify({ added: 1 }),
    });
  });

  it('persists a null duration and null result without falling back to defaults', () => {
    persist(db, baseInput({ durationMs: null, resultJson: null }));
    const row = db.select().from(syncJobResults).where(eq(syncJobResults.id, 'job-1')).get();
    expect(row?.durationMs).toBeNull();
    expect(row?.result).toBeNull();
  });

  it('keeps separate rows for distinct ids', () => {
    persist(db, baseInput({ id: 'job-1' }));
    persist(db, baseInput({ id: 'job-2', jobType: 'plexSyncTvShows' }));
    const rows = db.select().from(syncJobResults).all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).toSorted()).toEqual(['job-1', 'job-2']);
  });
});
