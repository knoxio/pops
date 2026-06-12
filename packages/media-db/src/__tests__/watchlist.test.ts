/**
 * Invariant tests for the watchlist service against an in-memory SQLite
 * seeded with the canonical `watchlist` baseline migration. Pure DB +
 * service layer — the legacy enriched list shape (title/posterUrl join)
 * lives on pops-api until the movies/tv-shows tables move into this
 * package, so it isn't covered here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addToWatchlist,
  getWatchlistEntry,
  getWatchlistStatus,
  listWatchlist,
  removeByMedia,
  removeFromWatchlist,
  reorderWatchlist,
  resequencePriorities,
  setPlexRatingKey,
  updateWatchlistEntry,
  WatchlistEntryNotFoundError,
  WatchlistReorderConflictError,
} from '../services/watchlist.js';

import type { MediaDb } from '../services/internal.js';

const MIGRATION_PATH = join(__dirname, '../../migrations/0023_watchlist_baseline.sql');

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

describe('addToWatchlist', () => {
  it('creates an entry and returns created=true', () => {
    const { row, created } = addToWatchlist(db, {
      mediaType: 'movie',
      mediaId: 550,
      priority: 2,
      notes: 'Must watch',
    });

    expect(created).toBe(true);
    expect(row.id).toBeGreaterThan(0);
    expect(row.mediaType).toBe('movie');
    expect(row.mediaId).toBe(550);
    expect(row.priority).toBe(2);
    expect(row.notes).toBe('Must watch');
    expect(row.source).toBe('manual');
  });

  it('returns the existing row on duplicate (mediaType, mediaId)', () => {
    const first = addToWatchlist(db, { mediaType: 'movie', mediaId: 550 });
    const second = addToWatchlist(db, { mediaType: 'movie', mediaId: 550 });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
  });

  it('applies defaults for optional fields', () => {
    const { row } = addToWatchlist(db, { mediaType: 'tv_show', mediaId: 100 });
    expect(row.priority).toBe(0);
    expect(row.notes).toBeNull();
    expect(row.plexRatingKey).toBeNull();
  });
});

describe('getWatchlistEntry', () => {
  it('returns the row for an existing id', () => {
    const { row } = addToWatchlist(db, { mediaType: 'movie', mediaId: 1 });
    const fetched = getWatchlistEntry(db, row.id);
    expect(fetched.id).toBe(row.id);
  });

  it('throws WatchlistEntryNotFoundError for an unknown id', () => {
    expect(() => getWatchlistEntry(db, 9999)).toThrow(WatchlistEntryNotFoundError);
  });
});

describe('getWatchlistStatus', () => {
  it('returns onWatchlist=true with the entryId when present', () => {
    const { row } = addToWatchlist(db, { mediaType: 'movie', mediaId: 7 });
    expect(getWatchlistStatus(db, 'movie', 7)).toEqual({ onWatchlist: true, entryId: row.id });
  });

  it('returns onWatchlist=false when absent', () => {
    expect(getWatchlistStatus(db, 'movie', 7)).toEqual({ onWatchlist: false, entryId: null });
  });
});

describe('listWatchlist', () => {
  it('returns rows ordered by priority ASC then addedAt DESC', () => {
    addToWatchlist(db, { mediaType: 'movie', mediaId: 1, priority: 2 });
    addToWatchlist(db, { mediaType: 'movie', mediaId: 2, priority: 0 });
    addToWatchlist(db, { mediaType: 'movie', mediaId: 3, priority: 1 });

    const result = listWatchlist(db, {}, 50, 0);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.mediaId)).toEqual([2, 3, 1]);
  });

  it('filters by mediaType', () => {
    addToWatchlist(db, { mediaType: 'movie', mediaId: 1 });
    addToWatchlist(db, { mediaType: 'tv_show', mediaId: 2 });
    addToWatchlist(db, { mediaType: 'movie', mediaId: 3 });

    const result = listWatchlist(db, { mediaType: 'movie' }, 50, 0);
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.mediaType === 'movie')).toBe(true);
  });

  it('applies limit + offset', () => {
    for (let i = 1; i <= 5; i++) {
      addToWatchlist(db, { mediaType: 'movie', mediaId: i });
    }
    const page = listWatchlist(db, {}, 2, 2);
    expect(page.total).toBe(5);
    expect(page.rows).toHaveLength(2);
  });
});

describe('updateWatchlistEntry', () => {
  it('updates only the specified fields', () => {
    const { row } = addToWatchlist(db, {
      mediaType: 'movie',
      mediaId: 1,
      priority: 1,
      notes: 'Original',
    });

    const updated = updateWatchlistEntry(db, row.id, { priority: 5 });
    expect(updated.priority).toBe(5);
    expect(updated.notes).toBe('Original');
  });

  it('throws WatchlistEntryNotFoundError when the id is missing', () => {
    expect(() => updateWatchlistEntry(db, 9999, { priority: 1 })).toThrow(
      WatchlistEntryNotFoundError
    );
  });
});

describe('removeFromWatchlist', () => {
  it('deletes the row', () => {
    const { row } = addToWatchlist(db, { mediaType: 'movie', mediaId: 1 });
    removeFromWatchlist(db, row.id);
    expect(() => getWatchlistEntry(db, row.id)).toThrow(WatchlistEntryNotFoundError);
  });

  it('throws when the id is missing', () => {
    expect(() => removeFromWatchlist(db, 9999)).toThrow(WatchlistEntryNotFoundError);
  });
});

describe('reorderWatchlist', () => {
  it('batch-updates priorities in the provided order', () => {
    const a = addToWatchlist(db, { mediaType: 'movie', mediaId: 1, priority: 0 });
    const b = addToWatchlist(db, { mediaType: 'movie', mediaId: 2, priority: 1 });
    const c = addToWatchlist(db, { mediaType: 'movie', mediaId: 3, priority: 2 });

    reorderWatchlist(db, [
      { id: c.row.id, priority: 0 },
      { id: a.row.id, priority: 1 },
      { id: b.row.id, priority: 2 },
    ]);

    const list = listWatchlist(db, {}, 50, 0);
    expect(list.rows.map((r) => r.mediaId)).toEqual([3, 1, 2]);
  });

  it('is a no-op for an empty array', () => {
    expect(() => reorderWatchlist(db, [])).not.toThrow();
  });

  it('throws WatchlistEntryNotFoundError for an unknown id', () => {
    expect(() => reorderWatchlist(db, [{ id: 9999, priority: 0 }])).toThrow(
      WatchlistEntryNotFoundError
    );
  });

  it('throws WatchlistReorderConflictError for duplicate priorities', () => {
    const a = addToWatchlist(db, { mediaType: 'movie', mediaId: 1 });
    const b = addToWatchlist(db, { mediaType: 'movie', mediaId: 2 });

    expect(() =>
      reorderWatchlist(db, [
        { id: a.row.id, priority: 0 },
        { id: b.row.id, priority: 0 },
      ])
    ).toThrow(WatchlistReorderConflictError);
  });
});

describe('removeByMedia', () => {
  it('returns true when a row is deleted', () => {
    addToWatchlist(db, { mediaType: 'movie', mediaId: 42 });
    expect(removeByMedia(db, 'movie', 42)).toBe(true);
    expect(getWatchlistStatus(db, 'movie', 42).onWatchlist).toBe(false);
  });

  it('returns false when no matching row exists', () => {
    expect(removeByMedia(db, 'movie', 9999)).toBe(false);
  });
});

describe('resequencePriorities', () => {
  it('rewrites priorities to a dense 0..N-1 sequence in order', () => {
    addToWatchlist(db, { mediaType: 'movie', mediaId: 1, priority: 5 });
    addToWatchlist(db, { mediaType: 'movie', mediaId: 2, priority: 10 });
    addToWatchlist(db, { mediaType: 'movie', mediaId: 3, priority: 20 });

    resequencePriorities(db);

    const list = listWatchlist(db, {}, 50, 0);
    expect(list.rows.map((r) => r.priority)).toEqual([0, 1, 2]);
  });
});

describe('setPlexRatingKey', () => {
  it('persists the rating key on the row', () => {
    const { row } = addToWatchlist(db, { mediaType: 'movie', mediaId: 1 });
    setPlexRatingKey(db, row.id, 'abc-123');
    const updated = getWatchlistEntry(db, row.id);
    expect(updated.plexRatingKey).toBe('abc-123');
  });
});
