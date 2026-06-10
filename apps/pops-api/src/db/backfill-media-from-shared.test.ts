/**
 * Boot-time backfill tests for `backfillMediaFromShared` (phase 2 PR 3).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `media.db` against on-disk SQLite files (in-memory DBs can't
 * be ATTACHed). Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the WHERE filter dedupes),
 *   - mixed state (some rows already in media) only inserts the missing ones,
 *   - missing source table is tolerated without throwing.
 *
 * Mirrors `backfill-core-from-shared.test.ts`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb } from '@pops/media-db';

import { backfillMediaFromShared, closeMediaDb, setMediaDb } from '../db/media-db-handle.js';
import { SHELF_IMPRESSIONS_TABLE_SQL } from './backfill-test-fixtures.js';

let tmpDir: string;

const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-backfill-'));
});

afterEach(() => {
  closeMediaDb();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

function openSharedWithRows(rows: { shelfId: string; shownAt: string }[]): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
  const insert = raw.prepare('INSERT INTO shelf_impressions (shelf_id, shown_at) VALUES (?, ?)');
  for (const row of rows) {
    insert.run(row.shelfId, row.shownAt);
  }
  raw.close();
  process.env['SQLITE_PATH'] = path;
  return path;
}

describe('backfillMediaFromShared', () => {
  it('returns silently when the media handle is closed', () => {
    setMediaDb(null);
    expect(() => backfillMediaFromShared()).not.toThrow();
  });

  it('copies fresh rows on first run and is a no-op on the second', () => {
    openSharedWithRows([
      { shelfId: 'trending', shownAt: '2026-06-09 12:00:00' },
      { shelfId: 'because-you-watched:42', shownAt: '2026-06-09 12:00:01' },
    ]);
    const media = openMediaDb(join(tmpDir, 'media.db'));
    setMediaDb(media);

    backfillMediaFromShared();
    const after = media.raw
      .prepare('SELECT id, shelf_id FROM shelf_impressions ORDER BY id')
      .all() as { id: number; shelf_id: string }[];
    expect(after.map((r) => r.shelf_id)).toEqual(['trending', 'because-you-watched:42']);

    backfillMediaFromShared();
    const second = media.raw.prepare('SELECT count(*) AS n FROM shelf_impressions').get() as {
      n: number;
    };
    expect(second.n).toBe(2);
  });

  it('only inserts rows missing from the media copy', () => {
    openSharedWithRows([
      { shelfId: 'trending', shownAt: '2026-06-09 12:00:00' },
      { shelfId: 'because-you-watched:42', shownAt: '2026-06-09 12:00:01' },
    ]);
    const media = openMediaDb(join(tmpDir, 'media.db'));
    setMediaDb(media);
    // Pre-seed id=1 in media so the backfill should skip it and only carry id=2 across.
    media.raw
      .prepare('INSERT INTO shelf_impressions (id, shelf_id, shown_at) VALUES (?, ?, ?)')
      .run(1, 'pre-existing', '2026-06-08 09:00:00');

    backfillMediaFromShared();
    const rows = media.raw
      .prepare('SELECT id, shelf_id FROM shelf_impressions ORDER BY id')
      .all() as { id: number; shelf_id: string }[];
    expect(rows).toEqual([
      { id: 1, shelf_id: 'pre-existing' },
      { id: 2, shelf_id: 'because-you-watched:42' },
    ]);
  });

  it('tolerates a shared DB without the shelf_impressions table', () => {
    const path = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(path);
    raw.close();
    process.env['SQLITE_PATH'] = path;

    const media = openMediaDb(join(tmpDir, 'media.db'));
    setMediaDb(media);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => backfillMediaFromShared()).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    const count = media.raw.prepare('SELECT count(*) AS n FROM shelf_impressions').get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });
});
