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
