/**
 * Invariant tests for the dismissed-discover service against an in-memory
 * SQLite seeded with the canonical `dismissed_discover` baseline migration.
 * Pure DB + service layer — no tRPC, no Express, no discovery scoring.
 *
 * Higher-level discovery-filter integration coverage lives in pops-api's
 * own suite and exercises this service via the dismiss/undismiss tRPC
 * procedures.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  dismiss,
  getDismissedTmdbIdSet,
  listDismissed,
  listDismissedTmdbIds,
  undismiss,
} from '../services/dismissed-discover.js';

import type { MediaDb } from '../services/internal.js';

const MIGRATION_PATH = join(
  __dirname,
  '../../migrations/0026_media_dismissed_discover_baseline.sql'
);

function freshDb(): { db: MediaDb; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return { db: drizzle(raw), raw };
}

let db: MediaDb;
let raw: Database.Database;

beforeEach(() => {
  ({ db, raw } = freshDb());
});

afterEach(() => {
  raw.close();
});

describe('dismiss', () => {
  it('inserts a row and stamps `dismissed_at` from the table default', () => {
    dismiss(db, 550);
    const [row] = raw.prepare('SELECT tmdb_id, dismissed_at FROM dismissed_discover').all() as {
      tmdb_id: number;
      dismissed_at: string;
    }[];
    expect(row.tmdb_id).toBe(550);
    expect(row.dismissed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('is idempotent — a duplicate tmdbId is a no-op (ON CONFLICT DO NOTHING)', () => {
    dismiss(db, 550);
    dismiss(db, 550);
    dismiss(db, 550);
    const [{ total }] = raw.prepare('SELECT COUNT(*) AS total FROM dismissed_discover').all() as {
      total: number;
    }[];
    expect(total).toBe(1);
  });

  it('keeps the original `dismissed_at` when a duplicate is rejected', () => {
    dismiss(db, 550);
    const [first] = raw
      .prepare('SELECT dismissed_at FROM dismissed_discover WHERE tmdb_id = ?')
      .all(550) as { dismissed_at: string }[];

    raw.exec(
      `UPDATE dismissed_discover SET dismissed_at = '1999-01-01 00:00:00' WHERE tmdb_id = 550`
    );
    dismiss(db, 550);

    const [second] = raw
      .prepare('SELECT dismissed_at FROM dismissed_discover WHERE tmdb_id = ?')
      .all(550) as { dismissed_at: string }[];

    expect(second.dismissed_at).toBe('1999-01-01 00:00:00');
    expect(second.dismissed_at).not.toBe(first.dismissed_at);
  });

  it('accepts many independent tmdbIds in sequence', () => {
    for (const id of [1, 2, 3, 4, 5]) dismiss(db, id);
    const rows = raw.prepare('SELECT tmdb_id FROM dismissed_discover ORDER BY tmdb_id').all() as {
      tmdb_id: number;
    }[];
    expect(rows.map((r) => r.tmdb_id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('undismiss', () => {
  it('removes a previously dismissed tmdbId', () => {
    dismiss(db, 550);
    undismiss(db, 550);
    const [{ total }] = raw.prepare('SELECT COUNT(*) AS total FROM dismissed_discover').all() as {
      total: number;
    }[];
    expect(total).toBe(0);
  });

  it('is a no-op when the tmdbId was never dismissed', () => {
    expect(() => undismiss(db, 9999)).not.toThrow();
    const [{ total }] = raw.prepare('SELECT COUNT(*) AS total FROM dismissed_discover').all() as {
      total: number;
    }[];
    expect(total).toBe(0);
  });

  it('only removes the targeted tmdbId — siblings stay', () => {
    dismiss(db, 550);
    dismiss(db, 551);
    dismiss(db, 552);
    undismiss(db, 551);
    const rows = raw.prepare('SELECT tmdb_id FROM dismissed_discover ORDER BY tmdb_id').all() as {
      tmdb_id: number;
    }[];
    expect(rows.map((r) => r.tmdb_id)).toEqual([550, 552]);
  });

  it('is idempotent across repeated calls', () => {
    dismiss(db, 550);
    undismiss(db, 550);
    undismiss(db, 550);
    undismiss(db, 550);
    const [{ total }] = raw.prepare('SELECT COUNT(*) AS total FROM dismissed_discover').all() as {
      total: number;
    }[];
    expect(total).toBe(0);
  });
});

describe('listDismissedTmdbIds', () => {
  it('returns an empty array on a fresh DB', () => {
    expect(listDismissedTmdbIds(db)).toEqual([]);
  });

  it('returns every dismissed tmdbId', () => {
    dismiss(db, 550);
    dismiss(db, 551);
    dismiss(db, 552);
    expect(listDismissedTmdbIds(db).toSorted((a, b) => a - b)).toEqual([550, 551, 552]);
  });

  it('reflects undismiss removals in the next read', () => {
    dismiss(db, 550);
    dismiss(db, 551);
    undismiss(db, 550);
    expect(listDismissedTmdbIds(db)).toEqual([551]);
  });
});

describe('getDismissedTmdbIdSet', () => {
  it('returns an empty Set on a fresh DB', () => {
    expect(getDismissedTmdbIdSet(db).size).toBe(0);
  });

  it('returns a Set with O(1) membership for every dismissed tmdbId', () => {
    dismiss(db, 550);
    dismiss(db, 551);
    const set = getDismissedTmdbIdSet(db);
    expect(set.size).toBe(2);
    expect(set.has(550)).toBe(true);
    expect(set.has(551)).toBe(true);
    expect(set.has(999)).toBe(false);
  });

  it('returns a fresh Set per call — mutations do not leak between callers', () => {
    dismiss(db, 550);
    const first = getDismissedTmdbIdSet(db);
    first.add(9999);
    const second = getDismissedTmdbIdSet(db);
    expect(second.has(9999)).toBe(false);
    expect(second.has(550)).toBe(true);
  });
});

describe('listDismissed', () => {
  it('returns full rows (tmdb_id + dismissed_at)', () => {
    dismiss(db, 550);
    const rows = listDismissed(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tmdbId).toBe(550);
    expect(rows[0]?.dismissedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('returns an empty array on a fresh DB', () => {
    expect(listDismissed(db)).toEqual([]);
  });
});
