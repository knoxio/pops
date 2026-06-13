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
import {
  SHELF_IMPRESSIONS_TABLE_SQL,
  TV_SHOWS_TABLE_SQL,
  WATCH_HISTORY_TABLE_SQL,
  WATCHLIST_TABLE_SQL,
} from './backfill-test-fixtures.js';

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

  describe('watch_history (PRD-168 PR 1)', () => {
    interface WatchHistorySeed {
      mediaType: 'movie' | 'episode';
      mediaId: number;
      watchedAt: string;
      completed?: number;
      blacklisted?: number;
    }

    function openSharedWithWatchHistory(rows: WatchHistorySeed[]): string {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.exec(WATCH_HISTORY_TABLE_SQL);
      const insert = raw.prepare(
        'INSERT INTO watch_history (media_type, media_id, watched_at, completed, blacklisted) VALUES (?, ?, ?, ?, ?)'
      );
      for (const row of rows) {
        insert.run(
          row.mediaType,
          row.mediaId,
          row.watchedAt,
          row.completed ?? 1,
          row.blacklisted ?? 0
        );
      }
      raw.close();
      process.env['SQLITE_PATH'] = path;
      return path;
    }

    it('copies fresh watch_history rows on first run and is a no-op on the second', () => {
      openSharedWithWatchHistory([
        { mediaType: 'movie', mediaId: 603, watchedAt: '2026-06-01 12:00:00' },
        { mediaType: 'episode', mediaId: 42, watchedAt: '2026-06-02 18:00:00' },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);

      backfillMediaFromShared();
      const after = media.raw
        .prepare('SELECT id, media_type, media_id FROM watch_history ORDER BY id')
        .all() as { id: number; media_type: string; media_id: number }[];
      expect(after.map((r) => r.media_id)).toEqual([603, 42]);

      backfillMediaFromShared();
      const second = media.raw.prepare('SELECT count(*) AS n FROM watch_history').get() as {
        n: number;
      };
      expect(second.n).toBe(2);
    });

    it('only inserts watch_history rows missing from the media copy', () => {
      openSharedWithWatchHistory([
        { mediaType: 'movie', mediaId: 603, watchedAt: '2026-06-01 12:00:00' },
        { mediaType: 'episode', mediaId: 42, watchedAt: '2026-06-02 18:00:00' },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);
      // Pre-seed id=1 with a different (media_type, media_id, watched_at)
      // tuple so the backfill skips it by id and the unique index doesn't
      // conflict with the id=2 carry-over.
      media.raw
        .prepare(
          'INSERT INTO watch_history (id, media_type, media_id, watched_at) VALUES (?, ?, ?, ?)'
        )
        .run(1, 'movie', 99_999, '2026-05-01 00:00:00');

      backfillMediaFromShared();
      const rows = media.raw
        .prepare('SELECT id, media_type, media_id FROM watch_history ORDER BY id')
        .all() as { id: number; media_type: string; media_id: number }[];
      expect(rows).toEqual([
        { id: 1, media_type: 'movie', media_id: 99_999 },
        { id: 2, media_type: 'episode', media_id: 42 },
      ]);
    });

    it('carries every column across (full-shape roundtrip)', () => {
      openSharedWithWatchHistory([
        {
          mediaType: 'episode',
          mediaId: 12_345,
          watchedAt: '2026-06-03 21:30:00',
          completed: 0,
          blacklisted: 1,
        },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);
      backfillMediaFromShared();

      const row = media.raw
        .prepare('SELECT * FROM watch_history WHERE media_id = ?')
        .get(12_345) as Record<string, unknown>;
      expect(row).toMatchObject({
        media_type: 'episode',
        media_id: 12_345,
        watched_at: '2026-06-03 21:30:00',
        completed: 0,
        blacklisted: 1,
      });
    });

    it('tolerates a shared DB without the watch_history table', () => {
      // Shared DB has shelf_impressions but no watch_history — backfill
      // copies shelf rows and skips watch_history without throwing.
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);

      expect(() => backfillMediaFromShared()).not.toThrow();
      const count = media.raw.prepare('SELECT count(*) AS n FROM watch_history').get() as {
        n: number;
      };
      expect(count.n).toBe(0);
    });
  });

  describe('watchlist (PRD-167 PR 2)', () => {
    interface WatchlistSeed {
      mediaType: 'movie' | 'tv_show';
      mediaId: number;
      priority?: number | null;
      notes?: string | null;
      source?: string;
      plexRatingKey?: string | null;
    }

    function openSharedWithWatchlist(rows: WatchlistSeed[]): string {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.exec(WATCHLIST_TABLE_SQL);
      const insert = raw.prepare(
        'INSERT INTO watchlist (media_type, media_id, priority, notes, source, plex_rating_key) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const row of rows) {
        insert.run(
          row.mediaType,
          row.mediaId,
          row.priority ?? null,
          row.notes ?? null,
          row.source ?? 'manual',
          row.plexRatingKey ?? null
        );
      }
      raw.close();
      process.env['SQLITE_PATH'] = path;
      return path;
    }

    it('copies fresh watchlist rows on first run and is a no-op on the second', () => {
      openSharedWithWatchlist([
        { mediaType: 'movie', mediaId: 603, priority: 0 },
        { mediaType: 'tv_show', mediaId: 42, priority: 1 },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);

      backfillMediaFromShared();
      const after = media.raw
        .prepare('SELECT id, media_type, media_id FROM watchlist ORDER BY id')
        .all() as { id: number; media_type: string; media_id: number }[];
      expect(after.map((r) => r.media_id)).toEqual([603, 42]);

      backfillMediaFromShared();
      const second = media.raw.prepare('SELECT count(*) AS n FROM watchlist').get() as {
        n: number;
      };
      expect(second.n).toBe(2);
    });

    it('only inserts watchlist rows missing from the media copy', () => {
      openSharedWithWatchlist([
        { mediaType: 'movie', mediaId: 603 },
        { mediaType: 'tv_show', mediaId: 42 },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);
      // Pre-seed id=1 with a different (media_type, media_id) tuple so the
      // backfill skips it by id and the unique index doesn't conflict with
      // the id=2 carry-over.
      media.raw
        .prepare('INSERT INTO watchlist (id, media_type, media_id) VALUES (?, ?, ?)')
        .run(1, 'movie', 99_999);

      backfillMediaFromShared();
      const rows = media.raw
        .prepare('SELECT id, media_type, media_id FROM watchlist ORDER BY id')
        .all() as { id: number; media_type: string; media_id: number }[];
      expect(rows).toEqual([
        { id: 1, media_type: 'movie', media_id: 99_999 },
        { id: 2, media_type: 'tv_show', media_id: 42 },
      ]);
    });

    it('carries every column across (full-shape roundtrip)', () => {
      openSharedWithWatchlist([
        {
          mediaType: 'tv_show',
          mediaId: 12_345,
          priority: 3,
          notes: 'Pinned for the weekend',
          source: 'plex',
          plexRatingKey: 'discover-key-1',
        },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);
      backfillMediaFromShared();

      const row = media.raw
        .prepare('SELECT * FROM watchlist WHERE media_id = ?')
        .get(12_345) as Record<string, unknown>;
      expect(row).toMatchObject({
        media_type: 'tv_show',
        media_id: 12_345,
        priority: 3,
        notes: 'Pinned for the weekend',
        source: 'plex',
        plex_rating_key: 'discover-key-1',
      });
    });

    it('tolerates a shared DB without the watchlist table', () => {
      // Shared DB has shelf_impressions but no watchlist — backfill copies
      // shelf rows and skips watchlist without throwing.
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);

      expect(() => backfillMediaFromShared()).not.toThrow();
      const count = media.raw.prepare('SELECT count(*) AS n FROM watchlist').get() as {
        n: number;
      };
      expect(count.n).toBe(0);
    });
  });
});
