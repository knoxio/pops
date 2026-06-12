/**
 * Invariant tests for the watch-history service against an in-memory
 * SQLite seeded with the canonical `0025_media_watch_history_baseline.sql`
 * migration. Pure DB + service layer — no tRPC, no Express, no
 * cross-table orchestration (debrief sessions, watchlist auto-removal,
 * comparison staleness reset, …) which stays at the router layer until
 * the dependent tables are themselves resident here.
 *
 * Higher-level CRUD integration coverage lives in pops-api's own suite
 * (`apps/pops-api/src/modules/media/watch-history/**`) and continues to
 * exercise the same persisted shape via the in-tree handlers until
 * PRD-168 PR 3 flips them onto this service.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { WatchHistoryConflictError, WatchHistoryNotFoundError } from '../errors.js';
import {
  add,
  byDateRange,
  byItem,
  delete as deleteEntry,
  getById,
  list,
  update,
  type AddWatchHistoryInput,
} from '../services/watch-history.js';

import type { MediaDb } from '../services/internal.js';

const MIGRATION_PATH = join(__dirname, '../../migrations/0025_media_watch_history_baseline.sql');

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

function baseInput(overrides: Partial<AddWatchHistoryInput> = {}): AddWatchHistoryInput {
  return {
    mediaType: 'movie',
    mediaId: 603,
    watchedAt: '2026-06-01 12:00:00',
    ...overrides,
  };
}

describe('add', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('persists the row and returns it with an assigned id', () => {
    const row = add(db, baseInput());
    expect(row.id).toBeGreaterThan(0);
    expect(row.mediaType).toBe('movie');
    expect(row.mediaId).toBe(603);
    expect(row.watchedAt).toBe('2026-06-01 12:00:00');
  });

  it('defaults completed to 1 when omitted', () => {
    const row = add(db, baseInput());
    expect(row.completed).toBe(1);
  });

  it('defaults blacklisted to 0 when omitted', () => {
    const row = add(db, baseInput());
    expect(row.blacklisted).toBe(0);
  });

  it('respects an explicit completed = 0 (partial watch)', () => {
    const row = add(db, baseInput({ completed: 0 }));
    expect(row.completed).toBe(0);
  });

  it('respects an explicit blacklisted = 1 (do-not-recommend marker)', () => {
    const row = add(db, baseInput({ blacklisted: 1 }));
    expect(row.blacklisted).toBe(1);
  });

  it('throws WatchHistoryConflictError on duplicate (mediaType, mediaId, watchedAt)', () => {
    add(db, baseInput());
    expect(() => add(db, baseInput())).toThrow(WatchHistoryConflictError);
  });

  it('allows multiple rows for the same item at different watched_at values', () => {
    const a = add(db, baseInput({ watchedAt: '2026-06-01 12:00:00' }));
    const b = add(db, baseInput({ watchedAt: '2026-06-02 12:00:00' }));
    expect(a.id).not.toBe(b.id);
  });
});

describe('getById', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('returns the persisted row by id', () => {
    const created = add(db, baseInput());
    expect(getById(db, created.id)).toEqual(created);
  });

  it('throws WatchHistoryNotFoundError when the id is missing', () => {
    expect(() => getById(db, 9_999)).toThrow(WatchHistoryNotFoundError);
  });
});

describe('list', () => {
  let db: MediaDb;

  beforeEach(() => {
    ({ db } = freshDb());
    add(db, { mediaType: 'movie', mediaId: 603, watchedAt: '2026-06-01 12:00:00' });
    add(db, { mediaType: 'movie', mediaId: 27205, watchedAt: '2026-06-02 12:00:00' });
    add(db, { mediaType: 'episode', mediaId: 42, watchedAt: '2026-06-03 12:00:00' });
    add(db, {
      mediaType: 'episode',
      mediaId: 43,
      watchedAt: '2026-06-04 12:00:00',
      completed: 0,
    });
  });

  it('returns all rows ordered by watched_at DESC with an accurate total', () => {
    const result = list(db, {}, 10, 0);
    expect(result.total).toBe(4);
    expect(result.rows.map((r) => r.mediaId)).toEqual([43, 42, 27205, 603]);
  });

  it('respects limit + offset for pagination', () => {
    const result = list(db, {}, 2, 1);
    expect(result.total).toBe(4);
    expect(result.rows.map((r) => r.mediaId)).toEqual([42, 27205]);
  });

  it('filters by mediaType', () => {
    const result = list(db, { mediaType: 'movie' }, 10, 0);
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.mediaType === 'movie')).toBe(true);
  });

  it('filters by mediaId', () => {
    const result = list(db, { mediaId: 603 }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.mediaId).toBe(603);
  });

  it('filters by completed', () => {
    const result = list(db, { completed: 0 }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.mediaId).toBe(43);
  });

  it('combines filters with AND', () => {
    const result = list(db, { mediaType: 'episode', completed: 1 }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.mediaId).toBe(42);
  });
});

describe('byItem', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('returns every watch entry for a single item, most recent first', () => {
    add(db, { mediaType: 'movie', mediaId: 603, watchedAt: '2026-06-01 12:00:00' });
    add(db, { mediaType: 'movie', mediaId: 603, watchedAt: '2026-06-03 12:00:00' });
    add(db, { mediaType: 'movie', mediaId: 603, watchedAt: '2026-06-02 12:00:00' });
    add(db, { mediaType: 'movie', mediaId: 27205, watchedAt: '2026-06-02 12:00:00' });

    const rows = byItem(db, 'movie', 603);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.watchedAt)).toEqual([
      '2026-06-03 12:00:00',
      '2026-06-02 12:00:00',
      '2026-06-01 12:00:00',
    ]);
  });

  it('returns an empty array for an item with no history', () => {
    expect(byItem(db, 'movie', 999)).toEqual([]);
  });

  it('does not bleed across mediaType when ids collide', () => {
    add(db, { mediaType: 'movie', mediaId: 1, watchedAt: '2026-06-01 12:00:00' });
    add(db, { mediaType: 'episode', mediaId: 1, watchedAt: '2026-06-02 12:00:00' });

    expect(byItem(db, 'movie', 1)).toHaveLength(1);
    expect(byItem(db, 'episode', 1)).toHaveLength(1);
  });
});

describe('byDateRange', () => {
  let db: MediaDb;

  beforeEach(() => {
    ({ db } = freshDb());
    add(db, { mediaType: 'movie', mediaId: 1, watchedAt: '2026-06-01 12:00:00' });
    add(db, { mediaType: 'movie', mediaId: 2, watchedAt: '2026-06-05 12:00:00' });
    add(db, { mediaType: 'movie', mediaId: 3, watchedAt: '2026-06-10 12:00:00' });
    add(db, { mediaType: 'episode', mediaId: 1, watchedAt: '2026-06-05 18:00:00' });
  });

  it('returns rows in the inclusive date range', () => {
    const rows = byDateRange(db, '2026-06-04 00:00:00', '2026-06-07 00:00:00');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.watchedAt)).toEqual(['2026-06-05 18:00:00', '2026-06-05 12:00:00']);
  });

  it('treats startDate and endDate as inclusive bounds', () => {
    const rows = byDateRange(db, '2026-06-01 12:00:00', '2026-06-10 12:00:00');
    expect(rows).toHaveLength(4);
  });

  it('excludes rows strictly outside the range', () => {
    const rows = byDateRange(db, '2026-06-11 00:00:00', '2026-06-30 23:59:59');
    expect(rows).toEqual([]);
  });

  it('narrows by mediaType when supplied', () => {
    const rows = byDateRange(db, '2026-06-01 00:00:00', '2026-06-30 23:59:59', 'episode');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mediaType).toBe('episode');
  });
});

describe('update', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('updates the supplied fields and re-reads the row', () => {
    const created = add(db, baseInput());
    const updated = update(db, created.id, { completed: 0 });
    expect(updated.completed).toBe(0);
    expect(updated.mediaId).toBe(603);
  });

  it('skips the UPDATE entirely when no fields are supplied (no-op patch)', () => {
    const created = add(db, baseInput());
    const updated = update(db, created.id, {});
    expect(updated).toEqual(created);
  });

  it('throws WatchHistoryNotFoundError when the id is missing', () => {
    expect(() => update(db, 9_999, { completed: 0 })).toThrow(WatchHistoryNotFoundError);
  });

  it('throws WatchHistoryConflictError when a patch collides with another row', () => {
    const a = add(db, { mediaType: 'movie', mediaId: 1, watchedAt: '2026-06-01 12:00:00' });
    add(db, { mediaType: 'movie', mediaId: 1, watchedAt: '2026-06-02 12:00:00' });
    expect(() => update(db, a.id, { watchedAt: '2026-06-02 12:00:00' })).toThrow(
      WatchHistoryConflictError
    );
  });
});

describe('delete', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('removes the row and a subsequent getById throws WatchHistoryNotFoundError', () => {
    const created = add(db, baseInput());
    deleteEntry(db, created.id);
    expect(() => getById(db, created.id)).toThrow(WatchHistoryNotFoundError);
  });

  it('throws WatchHistoryNotFoundError when the id is missing', () => {
    expect(() => deleteEntry(db, 9_999)).toThrow(WatchHistoryNotFoundError);
  });
});
