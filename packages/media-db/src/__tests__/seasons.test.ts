/**
 * Schema-shape invariants for the `seasons` baseline migration.
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

const SEASONS_MIGRATION = join(__dirname, '../../migrations/0027_media_seasons_baseline.sql');
const TV_SHOWS_MIGRATION = join(__dirname, '../../migrations/0024_media_tv_shows_baseline.sql');

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
  return raw;
}

let raw: Database.Database;

beforeEach(() => {
  raw = freshDb();
});

afterEach(() => {
  raw.close();
});

describe('seasons baseline migration', () => {
  it('creates the table with every expected column', () => {
    const cols = raw.prepare('PRAGMA table_info(seasons)').all() as ColumnInfo[];
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect([...byName.keys()].toSorted()).toEqual(
      [
        'id',
        'tv_show_id',
        'tvdb_id',
        'season_number',
        'name',
        'overview',
        'poster_path',
        'air_date',
        'episode_count',
        'created_at',
      ].toSorted()
    );
  });

  it('marks `id` as the integer primary key with autoincrement', () => {
    const cols = raw.prepare('PRAGMA table_info(seasons)').all() as ColumnInfo[];
    const id = cols.find((c) => c.name === 'id');
    expect(id?.pk).toBe(1);
    expect(id?.type.toLowerCase()).toBe('integer');

    raw.exec(`INSERT INTO tv_shows (tvdb_id, name) VALUES (1, 'Show')`);
    raw.exec(
      `INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (1, 100, 1), (1, 101, 2)`
    );
    const rows = raw.prepare('SELECT id FROM seasons ORDER BY id').all() as { id: number }[];
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('enforces NOT NULL on `tv_show_id`, `tvdb_id`, `season_number`, `created_at`', () => {
    const cols = raw.prepare('PRAGMA table_info(seasons)').all() as ColumnInfo[];
    const required = cols.filter((c) => c.notnull === 1).map((c) => c.name);
    expect(required.toSorted()).toEqual(
      ['id', 'tv_show_id', 'tvdb_id', 'season_number', 'created_at'].toSorted()
    );
  });

  it("defaults `created_at` to `datetime('now')`", () => {
    const cols = raw.prepare('PRAGMA table_info(seasons)').all() as ColumnInfo[];
    const createdAt = cols.find((c) => c.name === 'created_at');
    expect(createdAt?.dflt_value).toBe("datetime('now')");

    raw.exec(`INSERT INTO tv_shows (tvdb_id, name) VALUES (1, 'Show')`);
    raw.exec(`INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (1, 100, 1)`);
    const [{ created_at }] = raw.prepare('SELECT created_at FROM seasons').all() as {
      created_at: string;
    }[];
    expect(created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('declares a unique index on `tvdb_id`', () => {
    const indexes = raw.prepare('PRAGMA index_list(seasons)').all() as IndexInfo[];
    const tvdb = indexes.find((i) => i.name === 'idx_seasons_tvdb_id');
    expect(tvdb?.unique).toBe(1);

    raw.exec(`INSERT INTO tv_shows (tvdb_id, name) VALUES (1, 'Show')`);
    raw.exec(`INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (1, 100, 1)`);
    expect(() =>
      raw.exec(`INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (1, 100, 2)`)
    ).toThrow(/UNIQUE/);
  });

  it('declares a composite unique index on `(tv_show_id, season_number)`', () => {
    const indexes = raw.prepare('PRAGMA index_list(seasons)').all() as IndexInfo[];
    const composite = indexes.find((i) => i.name === 'idx_seasons_show_number');
    expect(composite?.unique).toBe(1);
    const cols = raw.prepare('PRAGMA index_info(idx_seasons_show_number)').all() as IndexColumn[];
    expect(cols.map((c) => c.name)).toEqual(['tv_show_id', 'season_number']);

    raw.exec(`INSERT INTO tv_shows (tvdb_id, name) VALUES (1, 'Show')`);
    raw.exec(`INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (1, 100, 1)`);
    expect(() =>
      raw.exec(`INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (1, 101, 1)`)
    ).toThrow(/UNIQUE/);
  });

  it('declares a non-unique index on `tv_show_id` for the FK lookup path', () => {
    const indexes = raw.prepare('PRAGMA index_list(seasons)').all() as IndexInfo[];
    const fkIdx = indexes.find((i) => i.name === 'idx_seasons_tv_show_id');
    expect(fkIdx?.unique).toBe(0);
  });

  it('declares the FK to `tv_shows(id)` with ON DELETE CASCADE', () => {
    const fks = raw.prepare('PRAGMA foreign_key_list(seasons)').all() as ForeignKeyInfo[];
    expect(fks).toHaveLength(1);
    expect(fks[0]).toMatchObject({
      table: 'tv_shows',
      from: 'tv_show_id',
      to: 'id',
      on_delete: 'CASCADE',
    });
  });

  it('cascades deletes from `tv_shows` to `seasons`', () => {
    raw.exec(`INSERT INTO tv_shows (tvdb_id, name) VALUES (1, 'Show')`);
    raw.exec(`INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (1, 100, 1)`);
    raw.exec(`DELETE FROM tv_shows WHERE id = 1`);
    const [{ total }] = raw.prepare('SELECT COUNT(*) AS total FROM seasons').all() as {
      total: number;
    }[];
    expect(total).toBe(0);
  });

  it('rejects an orphan insert when the parent `tv_shows` row is missing', () => {
    expect(() =>
      raw.exec(`INSERT INTO seasons (tv_show_id, tvdb_id, season_number) VALUES (999, 100, 1)`)
    ).toThrow(/FOREIGN KEY/);
  });
});
