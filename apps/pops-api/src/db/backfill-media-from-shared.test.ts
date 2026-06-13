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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb } from '@pops/media-db';

import { backfillMediaFromShared, closeMediaDb, setMediaDb } from '../db/media-db-handle.js';
import {
  DISMISSED_DISCOVER_TABLE_SQL,
  SHELF_IMPRESSIONS_TABLE_SQL,
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

describe('backfillMediaFromShared', () => {
  it('returns silently when the media handle is closed', () => {
    setMediaDb(null);
    expect(() => backfillMediaFromShared()).not.toThrow();
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
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
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
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
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

  describe('dismissed_discover (PRD-170 PR 3)', () => {
    interface DismissedSeed {
      tmdbId: number;
      dismissedAt?: string;
    }

    function openSharedWithDismissed(rows: DismissedSeed[]): string {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.exec(DISMISSED_DISCOVER_TABLE_SQL);
      const insert = raw.prepare(
        'INSERT INTO dismissed_discover (tmdb_id, dismissed_at) VALUES (?, ?)'
      );
      for (const row of rows) {
        insert.run(row.tmdbId, row.dismissedAt ?? '2026-06-10 12:00:00');
      }
      raw.close();
      process.env['SQLITE_PATH'] = path;
      return path;
    }

    it('copies fresh dismissed rows on first run and is a no-op on the second', () => {
      openSharedWithDismissed([
        { tmdbId: 550, dismissedAt: '2026-06-10 12:00:00' },
        { tmdbId: 603, dismissedAt: '2026-06-10 12:00:01' },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);

      backfillMediaFromShared();
      const after = media.raw
        .prepare('SELECT tmdb_id, dismissed_at FROM dismissed_discover ORDER BY tmdb_id')
        .all() as { tmdb_id: number; dismissed_at: string }[];
      expect(after.map((r) => r.tmdb_id)).toEqual([550, 603]);

      backfillMediaFromShared();
      const second = media.raw.prepare('SELECT count(*) AS n FROM dismissed_discover').get() as {
        n: number;
      };
      expect(second.n).toBe(2);
    });

    it('only inserts dismissed rows missing from the media copy', () => {
      openSharedWithDismissed([
        { tmdbId: 550, dismissedAt: '2026-06-10 12:00:00' },
        { tmdbId: 603, dismissedAt: '2026-06-10 12:00:01' },
      ]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);
      media.raw
        .prepare('INSERT INTO dismissed_discover (tmdb_id, dismissed_at) VALUES (?, ?)')
        .run(550, '2026-06-09 09:00:00');

      backfillMediaFromShared();
      const rows = media.raw
        .prepare('SELECT tmdb_id, dismissed_at FROM dismissed_discover ORDER BY tmdb_id')
        .all() as { tmdb_id: number; dismissed_at: string }[];
      expect(rows).toEqual([
        { tmdb_id: 550, dismissed_at: '2026-06-09 09:00:00' },
        { tmdb_id: 603, dismissed_at: '2026-06-10 12:00:01' },
      ]);
    });

    it('carries the dismissed_at timestamp across (full-shape roundtrip)', () => {
      openSharedWithDismissed([{ tmdbId: 42, dismissedAt: '2026-06-10 23:59:59' }]);
      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);
      backfillMediaFromShared();

      const row = media.raw
        .prepare('SELECT * FROM dismissed_discover WHERE tmdb_id = ?')
        .get(42) as Record<string, unknown>;
      expect(row).toMatchObject({ tmdb_id: 42, dismissed_at: '2026-06-10 23:59:59' });
    });

    it('tolerates a shared DB without the dismissed_discover table', () => {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SHELF_IMPRESSIONS_TABLE_SQL);
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const media = openMediaDb(join(tmpDir, 'media.db'));
      setMediaDb(media);

      expect(() => backfillMediaFromShared()).not.toThrow();
      const count = media.raw.prepare('SELECT count(*) AS n FROM dismissed_discover').get() as {
        n: number;
      };
      expect(count.n).toBe(0);
    });
  });
});
