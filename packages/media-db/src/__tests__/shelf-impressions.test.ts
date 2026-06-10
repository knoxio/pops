/**
 * Invariant tests for the shelf-impressions service against an in-memory
 * SQLite seeded with the canonical `shelf_impressions` migration. Pure DB +
 * service layer — no tRPC, no Express, no media-discovery selection logic.
 *
 * Higher-level discovery-session integration coverage lives in pops-api's
 * own suite and exercises the same service via the pops-api wrapper.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { shelfImpressions } from '../schema.js';
import {
  cleanupOldImpressions,
  getRecentImpressions,
  getShelfFreshness,
  initImpressionsService,
  recordImpressions,
} from '../services/shelf-impressions.js';

import type { MediaDb } from '../services/internal.js';

const MIGRATION_PATH = join(__dirname, '../../migrations/0021_spooky_lockheed.sql');

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

/** Insert a row with an explicit `shown_at` for deterministic window tests. */
function insertImpression(raw: Database.Database, shelfId: string, shownAt: string): void {
  raw
    .prepare('INSERT INTO shelf_impressions (shelf_id, shown_at) VALUES (?, ?)')
    .run(shelfId, shownAt);
}

function sqliteFormat(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function daysAgo(days: number): string {
  return sqliteFormat(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

describe('recordImpressions', () => {
  let db: MediaDb;
  let raw: Database.Database;
  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  it('is a no-op when given an empty list', () => {
    recordImpressions(db, []);
    const rows = db.select().from(shelfImpressions).all();
    expect(rows).toHaveLength(0);
  });

  it('inserts one row per shelf id', () => {
    recordImpressions(db, ['trending', 'because-you-watched:42']);
    const rows = raw.prepare('SELECT shelf_id FROM shelf_impressions ORDER BY id').all() as {
      shelf_id: string;
    }[];
    expect(rows.map((r) => r.shelf_id)).toEqual(['trending', 'because-you-watched:42']);
  });

  it('inserts a row for each call (no dedup)', () => {
    recordImpressions(db, ['trending']);
    recordImpressions(db, ['trending']);
    recordImpressions(db, ['trending']);
    const [{ total }] = raw
      .prepare('SELECT COUNT(*) AS total FROM shelf_impressions WHERE shelf_id = ?')
      .all('trending') as { total: number }[];
    expect(total).toBe(3);
  });

  it('stamps `shown_at` via the table default when not provided', () => {
    recordImpressions(db, ['trending']);
    const [row] = raw
      .prepare('SELECT shown_at FROM shelf_impressions WHERE shelf_id = ?')
      .all('trending') as { shown_at: string }[];
    expect(row.shown_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('getRecentImpressions', () => {
  let db: MediaDb;
  let raw: Database.Database;
  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  it('returns an empty map when the table is empty', () => {
    expect(getRecentImpressions(db).size).toBe(0);
  });

  it('groups counts by shelf id within the window', () => {
    insertImpression(raw, 'trending', daysAgo(1));
    insertImpression(raw, 'trending', daysAgo(2));
    insertImpression(raw, 'trending', daysAgo(3));
    insertImpression(raw, 'because-you-watched:42', daysAgo(1));

    const result = getRecentImpressions(db, 7);
    expect(result.size).toBe(2);
    expect(result.get('trending')).toBe(3);
    expect(result.get('because-you-watched:42')).toBe(1);
  });

  it('excludes impressions outside the lookback window', () => {
    insertImpression(raw, 'trending', daysAgo(1));
    insertImpression(raw, 'trending', daysAgo(8));
    insertImpression(raw, 'stale', daysAgo(20));

    const result = getRecentImpressions(db, 7);
    expect(result.get('trending')).toBe(1);
    expect(result.has('stale')).toBe(false);
  });

  it('defaults the window to 7 days', () => {
    insertImpression(raw, 'trending', daysAgo(6));
    insertImpression(raw, 'trending', daysAgo(8));
    expect(getRecentImpressions(db).get('trending')).toBe(1);
  });

  it('treats `days = 0` as "everything strictly newer than now" — nothing matches', () => {
    insertImpression(raw, 'trending', daysAgo(1));
    expect(getRecentImpressions(db, 0).size).toBe(0);
  });
});

describe('getShelfFreshness', () => {
  it('returns 1.0 for a shelf never shown', () => {
    expect(getShelfFreshness(0)).toBe(1);
  });

  it('returns 0.5 after one impression', () => {
    expect(getShelfFreshness(1)).toBeCloseTo(0.5);
  });

  it('is monotonically non-increasing as the count rises', () => {
    expect(getShelfFreshness(0)).toBeGreaterThan(getShelfFreshness(1));
    expect(getShelfFreshness(1)).toBeGreaterThan(getShelfFreshness(2));
    expect(getShelfFreshness(2)).toBeGreaterThan(getShelfFreshness(5));
  });

  it('hits the 0.1 floor at the formula boundary (count = 9)', () => {
    expect(getShelfFreshness(9)).toBeCloseTo(0.1);
  });

  it('clamps to the 0.1 floor for any count past the boundary', () => {
    expect(getShelfFreshness(10)).toBe(0.1);
    expect(getShelfFreshness(100)).toBe(0.1);
    expect(getShelfFreshness(9_999)).toBe(0.1);
  });
});

describe('cleanupOldImpressions', () => {
  let db: MediaDb;
  let raw: Database.Database;
  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  it('deletes rows older than the 30-day retention window', () => {
    insertImpression(raw, 'recent', daysAgo(5));
    insertImpression(raw, 'borderline', daysAgo(29));
    insertImpression(raw, 'ancient', daysAgo(45));
    insertImpression(raw, 'really-ancient', daysAgo(365));

    cleanupOldImpressions(db);

    const remaining = raw
      .prepare('SELECT shelf_id FROM shelf_impressions ORDER BY shelf_id')
      .all() as { shelf_id: string }[];
    expect(remaining.map((r) => r.shelf_id).toSorted()).toEqual(['borderline', 'recent']);
  });

  it('is idempotent (re-running deletes nothing more)', () => {
    insertImpression(raw, 'ancient', daysAgo(45));
    cleanupOldImpressions(db);
    cleanupOldImpressions(db);
    const [{ total }] = raw.prepare('SELECT COUNT(*) AS total FROM shelf_impressions').all() as {
      total: number;
    }[];
    expect(total).toBe(0);
  });

  it('leaves a fresh table untouched', () => {
    insertImpression(raw, 'recent', daysAgo(1));
    cleanupOldImpressions(db);
    const [{ total }] = raw.prepare('SELECT COUNT(*) AS total FROM shelf_impressions').all() as {
      total: number;
    }[];
    expect(total).toBe(1);
  });
});

describe('initImpressionsService', () => {
  let db: MediaDb;
  let raw: Database.Database;
  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  it('cleans up old impressions on init', () => {
    insertImpression(raw, 'recent', daysAgo(5));
    insertImpression(raw, 'ancient', daysAgo(60));

    initImpressionsService(db);

    const remaining = raw.prepare('SELECT shelf_id FROM shelf_impressions').all() as {
      shelf_id: string;
    }[];
    expect(remaining.map((r) => r.shelf_id)).toEqual(['recent']);
  });
});
