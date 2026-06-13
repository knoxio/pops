/**
 * Schema-shape invariants for the `episodes` baseline migration.
 *
 * No service layer exists yet — this PR only scaffolds the schema so the
 * mixed-tx `addTvShow` writer can move to `getMediaDrizzle()` atomically
 * in a follow-up. The tests below pin the persisted shape (columns,
 * defaults, indexes, FK behaviour) so the upcoming services and the
 * media-backfill bridge can rely on it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TV_SHOWS_MIGRATION = join(__dirname, '../../migrations/0024_media_tv_shows_baseline.sql');
const SEASONS_MIGRATION = join(__dirname, '../../migrations/0027_media_seasons_baseline.sql');
const EPISODES_MIGRATION = join(__dirname, '../../migrations/0028_media_episodes_baseline.sql');

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexInfo {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexColumn {
  seqno: number;
  cid: number;
  name: string;
}

interface ForeignKeyInfo {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

function execMigration(raw: Database.Database, path: string): void {
  const sql = readFileSync(path, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
}

function freshDb(): Database.Database {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  execMigration(raw, TV_SHOWS_MIGRATION);
  execMigration(raw, SEASONS_MIGRATION);
  execMigration(raw, EPISODES_MIGRATION);
  raw.exec(`INSERT INTO tv_shows (tvdb_id, name) VALUES (1, 'Show')`);
  raw.exec(`INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (1, 100, 1)`);
  return raw;
}

let raw: Database.Database;

beforeEach(() => {
  raw = freshDb();
});

afterEach(() => {
  raw.close();
});

describe('episodes baseline migration', () => {
  it('creates the table with every expected column', () => {
    const cols = raw.prepare('PRAGMA table_info(episodes)').all() as ColumnInfo[];
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect([...byName.keys()].toSorted()).toEqual(
      [
        'id',
        'season_id',
        'tvdb_id',
        'episode_number',
        'name',
        'overview',
        'air_date',
        'still_path',
        'vote_average',
        'runtime',
        'created_at',
      ].toSorted()
    );
  });

  it('marks `id` as the integer primary key with autoincrement', () => {
    const cols = raw.prepare('PRAGMA table_info(episodes)').all() as ColumnInfo[];
    const id = cols.find((c) => c.name === 'id');
    expect(id?.pk).toBe(1);
    expect(id?.type.toLowerCase()).toBe('integer');

    raw.exec(
      `INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (1, 1000, 1), (1, 1001, 2)`
    );
    const rows = raw.prepare('SELECT id FROM episodes ORDER BY id').all() as { id: number }[];
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('enforces NOT NULL on `season_id`, `tvdb_id`, `episode_number`, `created_at`', () => {
    const cols = raw.prepare('PRAGMA table_info(episodes)').all() as ColumnInfo[];
    const required = cols.filter((c) => c.notnull === 1).map((c) => c.name);
    expect(required.toSorted()).toEqual(
      ['id', 'season_id', 'tvdb_id', 'episode_number', 'created_at'].toSorted()
    );
  });

  it('types `vote_average` as REAL and `runtime` as INTEGER', () => {
    const cols = raw.prepare('PRAGMA table_info(episodes)').all() as ColumnInfo[];
    expect(cols.find((c) => c.name === 'vote_average')?.type.toLowerCase()).toBe('real');
    expect(cols.find((c) => c.name === 'runtime')?.type.toLowerCase()).toBe('integer');
  });

  it("defaults `created_at` to `datetime('now')`", () => {
    const cols = raw.prepare('PRAGMA table_info(episodes)').all() as ColumnInfo[];
    const createdAt = cols.find((c) => c.name === 'created_at');
    expect(createdAt?.dflt_value).toBe("datetime('now')");

    raw.exec(`INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (1, 1000, 1)`);
    const [{ created_at }] = raw.prepare('SELECT created_at FROM episodes').all() as {
      created_at: string;
    }[];
    expect(created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('declares a unique index on `tvdb_id`', () => {
    const indexes = raw.prepare('PRAGMA index_list(episodes)').all() as IndexInfo[];
    const tvdb = indexes.find((i) => i.name === 'idx_episodes_tvdb_id');
    expect(tvdb?.unique).toBe(1);

    raw.exec(`INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (1, 1000, 1)`);
    expect(() =>
      raw.exec(`INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (1, 1000, 2)`)
    ).toThrow(/UNIQUE/);
  });

  it('declares a composite unique index on `(season_id, episode_number)`', () => {
    const indexes = raw.prepare('PRAGMA index_list(episodes)').all() as IndexInfo[];
    const composite = indexes.find((i) => i.name === 'idx_episodes_season_number');
    expect(composite?.unique).toBe(1);
    const cols = raw
      .prepare('PRAGMA index_info(idx_episodes_season_number)')
      .all() as IndexColumn[];
    expect(cols.map((c) => c.name)).toEqual(['season_id', 'episode_number']);

    raw.exec(`INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (1, 1000, 1)`);
    expect(() =>
      raw.exec(`INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (1, 1001, 1)`)
    ).toThrow(/UNIQUE/);
  });

  it('declares a non-unique index on `season_id` for the FK lookup path', () => {
    const indexes = raw.prepare('PRAGMA index_list(episodes)').all() as IndexInfo[];
    const fkIdx = indexes.find((i) => i.name === 'idx_episodes_season_id');
    expect(fkIdx?.unique).toBe(0);
  });

  it('declares the FK to `seasons(id)` with ON DELETE CASCADE', () => {
    const fks = raw.prepare('PRAGMA foreign_key_list(episodes)').all() as ForeignKeyInfo[];
    expect(fks).toHaveLength(1);
    expect(fks[0]).toMatchObject({
      table: 'seasons',
      from: 'season_id',
      to: 'id',
      on_delete: 'CASCADE',
    });
  });

  it('cascades deletes from `seasons` to `episodes`', () => {
    raw.exec(`INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (1, 1000, 1)`);
    raw.exec(`DELETE FROM seasons WHERE id = 1`);
    const [{ total }] = raw.prepare('SELECT COUNT(*) AS total FROM episodes').all() as {
      total: number;
    }[];
    expect(total).toBe(0);
  });

  it('cascades deletes transitively from `tv_shows` through `seasons` to `episodes`', () => {
    raw.exec(`INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (1, 1000, 1)`);
    raw.exec(`DELETE FROM tv_shows WHERE id = 1`);
    const [{ seasons_total }] = raw
      .prepare('SELECT COUNT(*) AS seasons_total FROM seasons')
      .all() as { seasons_total: number }[];
    const [{ episodes_total }] = raw
      .prepare('SELECT COUNT(*) AS episodes_total FROM episodes')
      .all() as { episodes_total: number }[];
    expect(seasons_total).toBe(0);
    expect(episodes_total).toBe(0);
  });

  it('rejects an orphan insert when the parent `seasons` row is missing', () => {
    expect(() =>
      raw.exec(`INSERT INTO episodes (season_id, tvdb_id, episode_number) VALUES (999, 1000, 1)`)
    ).toThrow(/FOREIGN KEY/);
  });
});
