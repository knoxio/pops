/**
 * Smoke tests for the standalone `openMediaDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 *
 * Mirrors `@pops/core-db`'s open-core-db.test.ts.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb } from '../open-media-db.js';
import { shelfImpressions } from '../schema.js';
import { getRecentImpressions, recordImpressions } from '../services/shelf-impressions.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openMediaDb', () => {
  it('creates the parent directory and opens a fresh DB with the right pragmas', () => {
    const path = join(tmpDir, 'nested', 'sub', 'media.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openMediaDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the shelf_impressions migration', () => {
    const path = join(tmpDir, 'media.db');
    const { db, raw } = openMediaDb(path);
    try {
      // Table exists + accepts the package service end-to-end.
      recordImpressions(db, ['trending']);
      const rows = db.select().from(shelfImpressions).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.shelfId).toBe('trending');
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations or wipe rows', () => {
    const path = join(tmpDir, 'media.db');
    const first = openMediaDb(path);
    try {
      recordImpressions(first.db, ['trending', 'because-you-watched:42']);
      expect(getRecentImpressions(first.db, 7).size).toBe(2);
    } finally {
      first.raw.close();
    }

    const second = openMediaDb(path);
    try {
      // Migration apply is hash-checked + no-op'd; rows persist across opens.
      expect(getRecentImpressions(second.db, 7).size).toBe(2);
      expect(second.raw.pragma('journal_mode', { simple: true })).toBe('wal');
    } finally {
      second.raw.close();
    }
  });

  it('applies the media_scores baseline (0030) with the unique tuple + dimension index', () => {
    const path = join(tmpDir, 'media.db');
    const { raw } = openMediaDb(path);
    try {
      const columns = raw.prepare(`PRAGMA table_info(media_scores)`).all() as {
        name: string;
        notnull: number;
        dflt_value: string | null;
      }[];
      const names = new Set(columns.map((c) => c.name));
      expect(names).toEqual(
        new Set([
          'id',
          'media_type',
          'media_id',
          'dimension_id',
          'score',
          'comparison_count',
          'excluded',
          'updated_at',
        ])
      );

      const indexes = raw.prepare(`PRAGMA index_list(media_scores)`).all() as {
        name: string;
        unique: number;
      }[];
      const idxByName = new Map(indexes.map((i) => [i.name, i.unique === 1]));
      expect(idxByName.get('idx_media_scores_unique')).toBe(true);
      expect(idxByName.has('idx_media_scores_dimension')).toBe(true);

      // 0032_comparisons_baseline lands AFTER 0030 and restores the
      // intra-pillar `media_scores.dimension_id -> comparison_dimensions(id)`
      // FK, so seed the dimension first.
      raw
        .prepare(
          `INSERT INTO comparison_dimensions (id, name, description, active, sort_order, weight) VALUES (1, 'Test Dim', NULL, 1, 0, 1.0)`
        )
        .run();
      raw
        .prepare(
          `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run('movie', 1, 1, 1500, 0, 0);

      expect(() =>
        raw
          .prepare(
            `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run('movie', 1, 1, 1600, 0, 0)
      ).toThrow(/UNIQUE/);
    } finally {
      raw.close();
    }
  });

  it('applies the comparisons baseline (0032) with the dimensions/comparisons/skip-cooloffs tables and restores the media_scores → comparison_dimensions FK', () => {
    const path = join(tmpDir, 'media.db');
    const { raw } = openMediaDb(path);
    try {
      const tables = raw
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('comparison_dimensions','comparisons','comparison_skip_cooloffs','media_scores')`
        )
        .all() as { name: string }[];
      expect(new Set(tables.map((t) => t.name))).toEqual(
        new Set([
          'comparison_dimensions',
          'comparisons',
          'comparison_skip_cooloffs',
          'media_scores',
        ])
      );

      const dimColumns = raw.prepare(`PRAGMA table_info(comparison_dimensions)`).all() as {
        name: string;
      }[];
      expect(new Set(dimColumns.map((c) => c.name))).toEqual(
        new Set(['id', 'name', 'description', 'active', 'sort_order', 'weight', 'created_at'])
      );

      const compColumns = raw.prepare(`PRAGMA table_info(comparisons)`).all() as {
        name: string;
      }[];
      const compNames = new Set(compColumns.map((c) => c.name));
      expect(compNames.has('draw_tier')).toBe(true);
      expect(compNames.has('source')).toBe(true);
      expect(compNames.has('delta_a')).toBe(true);
      expect(compNames.has('delta_b')).toBe(true);

      const mediaScoreFks = raw.prepare(`PRAGMA foreign_key_list(media_scores)`).all() as {
        table: string;
        from: string;
        to: string;
      }[];
      const dimFk = mediaScoreFks.find((f) => f.from === 'dimension_id');
      expect(dimFk?.table).toBe('comparison_dimensions');
      expect(dimFk?.to).toBe('id');

      const dimRow = raw
        .prepare(
          `INSERT INTO comparison_dimensions (name, description) VALUES ('Test', 'desc') RETURNING id`
        )
        .get() as { id: number };
      raw
        .prepare(
          `INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id) VALUES (?, 'movie', 1, 'movie', 2, 'movie', 1)`
        )
        .run(dimRow.id);

      expect(() =>
        raw
          .prepare(
            `INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id) VALUES (?, 'movie', 1, 'movie', 2, 'movie', 1)`
          )
          .run(9999)
      ).toThrow(/FOREIGN KEY/);

      expect(() =>
        raw
          .prepare(
            `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES ('movie', 1, ?, 1500, 0, 0)`
          )
          .run(9999)
      ).toThrow(/FOREIGN KEY/);

      const cooloffIndexes = raw.prepare(`PRAGMA index_list(comparison_skip_cooloffs)`).all() as {
        name: string;
        unique: number;
      }[];
      const pairIdx = cooloffIndexes.find((i) => i.name === 'idx_comparison_skip_cooloffs_pair');
      expect(pairIdx?.unique).toBe(1);
    } finally {
      raw.close();
    }
  });

  it('applies the sync_logs baseline (0033) with the Plex ledger shape', () => {
    const path = join(tmpDir, 'media.db');
    const { raw } = openMediaDb(path);
    try {
      const columns = raw.prepare(`PRAGMA table_info(sync_logs)`).all() as {
        name: string;
      }[];
      expect(new Set(columns.map((c) => c.name))).toEqual(
        new Set(['id', 'synced_at', 'movies_synced', 'tv_shows_synced', 'errors', 'duration_ms'])
      );

      raw
        .prepare(
          `INSERT INTO sync_logs (synced_at, movies_synced, tv_shows_synced, errors, duration_ms) VALUES (?, ?, ?, ?, ?)`
        )
        .run(new Date().toISOString(), 5, 2, null, 1234);

      const row = raw
        .prepare(
          `SELECT movies_synced as moviesSynced, tv_shows_synced as tvShowsSynced FROM sync_logs LIMIT 1`
        )
        .get() as { moviesSynced: number; tvShowsSynced: number } | undefined;
      expect(row?.moviesSynced).toBe(5);
      expect(row?.tvShowsSynced).toBe(2);
    } finally {
      raw.close();
    }
  });

  it('applies the rotation baseline (0031) with the intra-pillar source FK preserved', () => {
    const path = join(tmpDir, 'media.db');
    const { raw } = openMediaDb(path);
    try {
      const tables = raw
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('rotation_log','rotation_sources','rotation_candidates','rotation_exclusions')`
        )
        .all() as { name: string }[];
      expect(new Set(tables.map((t) => t.name))).toEqual(
        new Set(['rotation_log', 'rotation_sources', 'rotation_candidates', 'rotation_exclusions'])
      );

      const source = raw
        .prepare(
          `INSERT INTO rotation_sources (type, name) VALUES ('manual', 'Manual Queue') RETURNING id`
        )
        .get() as { id: number };
      raw
        .prepare(
          `INSERT INTO rotation_candidates (source_id, tmdb_id, title, status) VALUES (?, ?, ?, ?)`
        )
        .run(source.id, 555, 'Test', 'pending');

      // Cascade delete on rotation_sources cleans rotation_candidates.
      raw.prepare(`DELETE FROM rotation_sources WHERE id = ?`).run(source.id);
      const remaining = raw.prepare(`SELECT COUNT(*) as c FROM rotation_candidates`).get() as {
        c: number;
      };
      expect(remaining.c).toBe(0);

      // Orphan FK insert (no parent row) must fail because FK enforcement is on.
      expect(() =>
        raw
          .prepare(
            `INSERT INTO rotation_candidates (source_id, tmdb_id, title, status) VALUES (?, ?, ?, ?)`
          )
          .run(9999, 9, 'Orphan', 'pending')
      ).toThrow(/FOREIGN KEY/);
    } finally {
      raw.close();
    }
  });
});
