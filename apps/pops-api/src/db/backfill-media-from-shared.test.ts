/**
 * Boot-time backfill tests for `backfillMediaFromShared` (Theme-13 Wave-5
 * media_scores + rotation_* slice).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * media pillar's `media.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). The set covered is `media_scores`, `rotation_log`,
 * `rotation_sources`, `rotation_candidates`, and `rotation_exclusions`.
 * Confirms:
 *   - first run carries existing rows across for all tables,
 *   - second run is a no-op (idempotent — the per-table NOT EXISTS dedupes),
 *   - business-key dedup honours (media_type, media_id, dimension_id) for
 *     media_scores and tmdb_id for rotation_candidates / rotation_exclusions,
 *   - rotation_candidates.source_id FK survives the ATTACH copy,
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb } from '@pops/media-db';

import { backfillMediaFromShared } from './backfill-media-from-shared.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-backfill-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const MEDIA_SCORES_SQL = `
CREATE TABLE media_scores (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  media_type text NOT NULL,
  media_id integer NOT NULL,
  dimension_id integer NOT NULL,
  score real DEFAULT 1500 NOT NULL,
  comparison_count integer DEFAULT 0 NOT NULL,
  excluded integer DEFAULT 0 NOT NULL,
  updated_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX idx_media_scores_unique ON media_scores (media_type, media_id, dimension_id);
`;

const ROTATION_LOG_SQL = `
CREATE TABLE rotation_log (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  executed_at text NOT NULL,
  movies_marked_leaving integer NOT NULL,
  movies_removed integer NOT NULL,
  movies_added integer NOT NULL,
  removals_failed integer NOT NULL,
  free_space_gb real NOT NULL,
  target_free_gb real NOT NULL,
  skipped_reason text,
  details text
);
`;

const ROTATION_SOURCES_SQL = `
CREATE TABLE rotation_sources (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  type text NOT NULL,
  name text NOT NULL,
  priority integer DEFAULT 5 NOT NULL,
  enabled integer DEFAULT 1 NOT NULL,
  config text,
  last_synced_at text,
  sync_interval_hours integer DEFAULT 24 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
`;

const ROTATION_CANDIDATES_SQL = `
CREATE TABLE rotation_candidates (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id integer NOT NULL REFERENCES rotation_sources(id) ON DELETE CASCADE,
  tmdb_id integer NOT NULL,
  title text NOT NULL,
  year integer,
  rating real,
  poster_path text,
  status text DEFAULT 'pending' NOT NULL,
  discovered_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX idx_rotation_candidates_tmdb_id ON rotation_candidates (tmdb_id);
`;

const ROTATION_EXCLUSIONS_SQL = `
CREATE TABLE rotation_exclusions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  tmdb_id integer NOT NULL,
  title text NOT NULL,
  reason text,
  excluded_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX idx_rotation_exclusions_tmdb_id ON rotation_exclusions (tmdb_id);
`;

const COMPARISON_DIMENSIONS_SQL = `
CREATE TABLE comparison_dimensions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  name text NOT NULL,
  description text,
  active integer DEFAULT 1 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  weight real DEFAULT 1 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX idx_comparison_dimensions_name ON comparison_dimensions (name);
`;

const COMPARISONS_SQL = `
CREATE TABLE comparisons (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  dimension_id integer NOT NULL REFERENCES comparison_dimensions(id),
  media_a_type text NOT NULL,
  media_a_id integer NOT NULL,
  media_b_type text NOT NULL,
  media_b_id integer NOT NULL,
  winner_type text NOT NULL,
  winner_id integer NOT NULL,
  draw_tier text,
  source text,
  delta_a integer,
  delta_b integer,
  compared_at text DEFAULT (datetime('now')) NOT NULL
);
`;

const COMPARISON_SKIP_COOLOFFS_SQL = `
CREATE TABLE comparison_skip_cooloffs (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  dimension_id integer NOT NULL REFERENCES comparison_dimensions(id),
  media_a_type text NOT NULL,
  media_a_id integer NOT NULL,
  media_b_type text NOT NULL,
  media_b_id integer NOT NULL,
  skip_until integer NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX idx_comparison_skip_cooloffs_pair ON comparison_skip_cooloffs (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id);
`;

const SYNC_LOGS_SQL = `
CREATE TABLE sync_logs (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  synced_at text NOT NULL,
  movies_synced integer DEFAULT 0 NOT NULL,
  tv_shows_synced integer DEFAULT 0 NOT NULL,
  errors text,
  duration_ms integer
);
`;

function seedSharedDb(): string {
  const sharedPath = join(tmpDir, 'pops.db');
  const shared = new BetterSqlite3(sharedPath);
  shared.exec(COMPARISON_DIMENSIONS_SQL);
  shared.exec(COMPARISONS_SQL);
  shared.exec(COMPARISON_SKIP_COOLOFFS_SQL);
  shared.exec(MEDIA_SCORES_SQL);
  shared.exec(ROTATION_LOG_SQL);
  shared.exec(ROTATION_SOURCES_SQL);
  shared.exec(ROTATION_CANDIDATES_SQL);
  shared.exec(ROTATION_EXCLUSIONS_SQL);
  shared.exec(SYNC_LOGS_SQL);

  shared
    .prepare(
      `INSERT INTO comparison_dimensions (name, description, active, sort_order, weight) VALUES (?, ?, 1, 0, 1.0)`
    )
    .run('Cinematography', 'visual quality');
  shared
    .prepare(
      `INSERT INTO comparison_dimensions (name, description, active, sort_order, weight) VALUES (?, ?, 1, 1, 0.8)`
    )
    .run('Soundtrack', 'audio quality');

  shared
    .prepare(
      `INSERT INTO comparisons (id, dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id, draw_tier, source, delta_a, delta_b, compared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, datetime('now'))`
    )
    .run(1, 1, 'movie', 1, 'movie', 2, 'movie', 1, 'arena', 16, -16);

  shared
    .prepare(
      `INSERT INTO comparison_skip_cooloffs (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, skip_until, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(1, 'movie', 3, 'movie', 4, 100);

  shared
    .prepare(
      `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run('movie', 1, 1, 1700, 5, 0);
  shared
    .prepare(
      `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run('movie', 2, 1, 1450, 3, 0);

  shared
    .prepare(
      `INSERT INTO rotation_log (id, executed_at, movies_marked_leaving, movies_removed, movies_added, removals_failed, free_space_gb, target_free_gb, skipped_reason, details) VALUES (?, datetime('now'), 0, 1, 1, 0, 120, 100, NULL, NULL)`
    )
    .run(1);

  shared
    .prepare(
      `INSERT INTO rotation_sources (id, type, name, priority, enabled, config, last_synced_at, sync_interval_hours, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, datetime('now'))`
    )
    .run(1, 'manual', 'Manual Queue', 5, 1, 24);

  shared
    .prepare(
      `INSERT INTO rotation_candidates (source_id, tmdb_id, title, year, rating, poster_path, status, discovered_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(1, 111, 'Test Movie', 2024, 7.5, null, 'pending');

  shared
    .prepare(
      `INSERT INTO rotation_exclusions (tmdb_id, title, reason, excluded_at) VALUES (?, ?, ?, datetime('now'))`
    )
    .run(222, 'Excluded Movie', 'manual');

  shared
    .prepare(
      `INSERT INTO sync_logs (id, synced_at, movies_synced, tv_shows_synced, errors, duration_ms) VALUES (?, datetime('now'), ?, ?, NULL, ?)`
    )
    .run(1, 10, 4, 2500);

  shared.close();
  return sharedPath;
}

describe('backfillMediaFromShared', () => {
  it('first run copies every table from pops.db into media.db', () => {
    const sharedPath = seedSharedDb();
    const mediaPath = join(tmpDir, 'media.db');
    const media = openMediaDb(mediaPath);
    try {
      backfillMediaFromShared(media, sharedPath);

      const scores = media.raw
        .prepare(
          `SELECT media_type, media_id, dimension_id, score FROM media_scores ORDER BY media_id`
        )
        .all() as { media_type: string; media_id: number; dimension_id: number; score: number }[];
      expect(scores).toHaveLength(2);
      expect(scores[0]?.score).toBe(1700);

      const logs = media.raw.prepare(`SELECT id FROM rotation_log`).all() as { id: number }[];
      expect(logs).toHaveLength(1);

      const sources = media.raw.prepare(`SELECT id, type, name FROM rotation_sources`).all() as {
        id: number;
        type: string;
        name: string;
      }[];
      expect(sources).toHaveLength(1);
      expect(sources[0]?.type).toBe('manual');

      const candidates = media.raw
        .prepare(`SELECT tmdb_id, source_id FROM rotation_candidates`)
        .all() as { tmdb_id: number; source_id: number }[];
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.tmdb_id).toBe(111);
      expect(candidates[0]?.source_id).toBe(1);

      const exclusions = media.raw.prepare(`SELECT tmdb_id FROM rotation_exclusions`).all() as {
        tmdb_id: number;
      }[];
      expect(exclusions).toHaveLength(1);
      expect(exclusions[0]?.tmdb_id).toBe(222);

      const dimensions = media.raw
        .prepare(`SELECT id, name, weight FROM comparison_dimensions ORDER BY id`)
        .all() as { id: number; name: string; weight: number }[];
      expect(dimensions).toHaveLength(2);
      expect(dimensions[0]?.name).toBe('Cinematography');
      expect(dimensions[1]?.weight).toBe(0.8);

      const comparisons = media.raw
        .prepare(`SELECT id, dimension_id, source FROM comparisons`)
        .all() as { id: number; dimension_id: number; source: string | null }[];
      expect(comparisons).toHaveLength(1);
      expect(comparisons[0]?.source).toBe('arena');

      const cooloffs = media.raw
        .prepare(`SELECT dimension_id, media_a_id, skip_until FROM comparison_skip_cooloffs`)
        .all() as { dimension_id: number; media_a_id: number; skip_until: number }[];
      expect(cooloffs).toHaveLength(1);
      expect(cooloffs[0]?.skip_until).toBe(100);

      const syncLogs = media.raw.prepare(`SELECT id, movies_synced FROM sync_logs`).all() as {
        id: number;
        movies_synced: number;
      }[];
      expect(syncLogs).toHaveLength(1);
      expect(syncLogs[0]?.movies_synced).toBe(10);
    } finally {
      media.raw.close();
    }
  });

  it('second run is a no-op against an already-populated media.db', () => {
    const sharedPath = seedSharedDb();
    const mediaPath = join(tmpDir, 'media.db');
    const media = openMediaDb(mediaPath);
    try {
      backfillMediaFromShared(media, sharedPath);
      const initialScoreCount = (
        media.raw.prepare(`SELECT COUNT(*) AS c FROM media_scores`).get() as { c: number }
      ).c;
      const initialLogCount = (
        media.raw.prepare(`SELECT COUNT(*) AS c FROM rotation_log`).get() as { c: number }
      ).c;

      backfillMediaFromShared(media, sharedPath);

      const finalScoreCount = (
        media.raw.prepare(`SELECT COUNT(*) AS c FROM media_scores`).get() as { c: number }
      ).c;
      const finalLogCount = (
        media.raw.prepare(`SELECT COUNT(*) AS c FROM rotation_log`).get() as { c: number }
      ).c;

      expect(finalScoreCount).toBe(initialScoreCount);
      expect(finalLogCount).toBe(initialLogCount);
    } finally {
      media.raw.close();
    }
  });

  it('honours the (media_type, media_id, dimension_id) business key on media_scores', () => {
    const sharedPath = seedSharedDb();
    const mediaPath = join(tmpDir, 'media.db');
    const media = openMediaDb(mediaPath);
    try {
      // Pre-seed media.db with the dimension (the new intra-pillar FK on
      // media_scores.dimension_id requires it) and one of the score rows so
      // the existence filter has to recognise the business-key collision
      // instead of just the surrogate id.
      media.raw
        .prepare(
          `INSERT INTO comparison_dimensions (id, name, description, active, sort_order, weight) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(1, 'Cinematography', 'visual quality', 1, 0, 1.0);
      media.raw
        .prepare(
          `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run('movie', 1, 1, 1800, 99, 0);

      backfillMediaFromShared(media, sharedPath);

      const rows = media.raw
        .prepare(
          `SELECT media_type, media_id, dimension_id, score, comparison_count FROM media_scores ORDER BY media_id`
        )
        .all() as { media_id: number; score: number; comparison_count: number }[];
      expect(rows).toHaveLength(2);
      // Pre-seeded row wins; shared row is skipped by the NOT EXISTS dedupe.
      expect(rows[0]?.score).toBe(1800);
      expect(rows[0]?.comparison_count).toBe(99);
      expect(rows[1]?.score).toBe(1450);
    } finally {
      media.raw.close();
    }
  });

  it('is non-fatal when the shared pops.db is missing the source tables', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const shared = new BetterSqlite3(sharedPath);
    shared.exec(COMPARISON_DIMENSIONS_SQL);
    shared.exec(MEDIA_SCORES_SQL);
    shared
      .prepare(
        `INSERT INTO comparison_dimensions (id, name, description, active, sort_order, weight) VALUES (1, 'Cinematography', NULL, 1, 0, 1.0)`
      )
      .run();
    shared
      .prepare(
        `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded, updated_at) VALUES ('movie', 1, 1, 1500, 0, 0, datetime('now'))`
      )
      .run();
    shared.close();

    const mediaPath = join(tmpDir, 'media.db');
    const media = openMediaDb(mediaPath);
    try {
      expect(() => backfillMediaFromShared(media, sharedPath)).not.toThrow();

      const scoreCount = (
        media.raw.prepare(`SELECT COUNT(*) AS c FROM media_scores`).get() as { c: number }
      ).c;
      expect(scoreCount).toBe(1);
    } finally {
      media.raw.close();
    }
  });
});
