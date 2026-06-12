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
import { SHELF_IMPRESSIONS_TABLE_SQL, TV_SHOWS_TABLE_SQL } from './backfill-test-fixtures.js';

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

  describe('tv_shows (PRD-166 PR 1)', () => {
    function openSharedWithTvShows(
      rows: { tvdbId: number; name: string; firstAirDate?: string | null }[]
    ): string {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.exec(TV_SHOWS_TABLE_SQL);
      const insert = raw.prepare(
        'INSERT INTO tv_shows (tvdb_id, name, first_air_date) VALUES (?, ?, ?)'
      );
      for (const row of rows) {
        insert.run(row.tvdbId, row.name, row.firstAirDate ?? null);
      }
      raw.close();
      process.env['SQLITE_PATH'] = path;
      return path;
    }

    it('copies fresh tv-show rows on first run and is a no-op on the second', () => {
      openSharedWithTvShows([
        { tvdbId: 81189, name: 'Breaking Bad', firstAirDate: '2008-01-20' },
        { tvdbId: 1396, name: 'Better Call Saul', firstAirDate: '2015-02-08' },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);

      backfillMediaFromShared();
      const after = media.raw
        .prepare('SELECT id, tvdb_id, name FROM tv_shows ORDER BY id')
        .all() as { id: number; tvdb_id: number; name: string }[];
      expect(after.map((r) => r.name)).toEqual(['Breaking Bad', 'Better Call Saul']);

      backfillMediaFromShared();
      const second = media.raw.prepare('SELECT count(*) AS n FROM tv_shows').get() as {
        n: number;
      };
      expect(second.n).toBe(2);
    });

    it('only inserts tv-show rows missing from the media copy', () => {
      openSharedWithTvShows([
        { tvdbId: 81189, name: 'Breaking Bad' },
        { tvdbId: 1396, name: 'Better Call Saul' },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);
      media.raw
        .prepare('INSERT INTO tv_shows (id, tvdb_id, name) VALUES (?, ?, ?)')
        .run(1, 99999, 'Pre-existing');

      backfillMediaFromShared();
      const rows = media.raw
        .prepare('SELECT id, tvdb_id, name FROM tv_shows ORDER BY id')
        .all() as { id: number; tvdb_id: number; name: string }[];
      expect(rows).toEqual([
        { id: 1, tvdb_id: 99999, name: 'Pre-existing' },
        { id: 2, tvdb_id: 1396, name: 'Better Call Saul' },
      ]);
    });

    it('carries every column across (full-shape roundtrip)', () => {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.exec(TV_SHOWS_TABLE_SQL);
      raw
        .prepare(
          `INSERT INTO tv_shows (
            tvdb_id, name, original_name, overview,
            first_air_date, last_air_date, status, original_language,
            number_of_seasons, number_of_episodes, episode_run_time,
            poster_path, backdrop_path, logo_path, poster_override_path,
            discover_rating_key, vote_average, vote_count, genres, networks,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?
          )`
        )
        .run(
          81189,
          'Breaking Bad',
          'Breaking Bad',
          'A high-school chemistry teacher turned methamphetamine producer.',
          '2008-01-20',
          '2013-09-29',
          'Ended',
          'en',
          5,
          62,
          47,
          '/poster.jpg',
          '/backdrop.jpg',
          '/logo.png',
          '/override.jpg',
          'discover-key-bb',
          9.5,
          12_345,
          JSON.stringify(['Drama', 'Crime']),
          JSON.stringify(['AMC']),
          '2026-06-01 00:00:00',
          '2026-06-02 00:00:00'
        );
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);
      backfillMediaFromShared();

      const row = media.raw
        .prepare('SELECT * FROM tv_shows WHERE tvdb_id = ?')
        .get(81189) as Record<string, unknown>;
      expect(row).toMatchObject({
        tvdb_id: 81189,
        name: 'Breaking Bad',
        original_name: 'Breaking Bad',
        first_air_date: '2008-01-20',
        last_air_date: '2013-09-29',
        status: 'Ended',
        original_language: 'en',
        number_of_seasons: 5,
        number_of_episodes: 62,
        episode_run_time: 47,
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
        logo_path: '/logo.png',
        poster_override_path: '/override.jpg',
        discover_rating_key: 'discover-key-bb',
        vote_average: 9.5,
        vote_count: 12_345,
        created_at: '2026-06-01 00:00:00',
        updated_at: '2026-06-02 00:00:00',
      });
      expect(JSON.parse(String(row['genres']))).toEqual(['Drama', 'Crime']);
      expect(JSON.parse(String(row['networks']))).toEqual(['AMC']);
    });

    it('tolerates a shared DB without the tv_shows table', () => {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);

      expect(() => backfillMediaFromShared()).not.toThrow();
      const count = media.raw.prepare('SELECT count(*) AS n FROM tv_shows').get() as { n: number };
      expect(count.n).toBe(0);
    });
  });
});
