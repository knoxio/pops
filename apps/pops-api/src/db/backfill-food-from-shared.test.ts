/**
 * Boot-time backfill tests for `backfillFoodFromShared` (phase 2 PR 3).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `food.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the per-table WHERE filter dedupes),
 *   - mixed state (some rows already in food) only inserts the missing ones,
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '@pops/food-db';

import { backfillFoodFromShared } from './backfill-food-from-shared.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-backfill-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const PREP_STATES_SQL = `
CREATE TABLE prep_states (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  name text NOT NULL,
  slug text NOT NULL
);
CREATE UNIQUE INDEX prep_states_name_unique ON prep_states (name);
CREATE UNIQUE INDEX prep_states_slug_unique ON prep_states (slug);
CREATE TABLE slug_registry (
  slug text PRIMARY KEY NOT NULL,
  kind text NOT NULL,
  target_id integer NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  CONSTRAINT "ck_slug_registry_kind" CHECK(kind IN ('ingredient','recipe','prep_state'))
);
CREATE INDEX idx_slug_registry_kind_target ON slug_registry (kind, target_id);
`;

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(PREP_STATES_SQL);
  seed(raw);
  raw.close();
  return path;
}

function insertPrepState(
  raw: BetterSqlite3.Database,
  id: number,
  name: string,
  slug: string
): void {
  raw.prepare('INSERT INTO prep_states (id, name, slug) VALUES (?, ?, ?)').run(id, name, slug);
}

function insertSlug(
  raw: BetterSqlite3.Database,
  slug: string,
  kind: 'prep_state' | 'ingredient' | 'recipe',
  targetId: number
): void {
  raw
    .prepare(
      "INSERT INTO slug_registry (slug, kind, target_id, created_at) VALUES (?, ?, ?, '2026-06-10T00:00:00Z')"
    )
    .run(slug, kind, targetId);
}

describe('backfillFoodFromShared', () => {
  it('copies prep_states rows from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => insertPrepState(raw, 1, 'Diced', 'diced'));

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM prep_states').get() as {
        n: number;
      };
      expect(n).toBe(1);
    } finally {
      food.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate rows', () => {
    const sharedPath = openSharedWithSeed((raw) => insertPrepState(raw, 1, 'Diced', 'diced'));

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      backfillFoodFromShared(food, sharedPath);
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM prep_states').get() as {
        n: number;
      };
      expect(n).toBe(1);
    } finally {
      food.raw.close();
    }
  });

  it('only inserts rows missing from the food copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertPrepState(raw, 1, 'Diced', 'diced');
      insertPrepState(raw, 2, 'Sliced', 'sliced');
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      insertPrepState(food.raw, 1, 'Diced', 'diced');
      backfillFoodFromShared(food, sharedPath);
      const rows = food.raw.prepare('SELECT id, slug FROM prep_states ORDER BY id').all() as {
        id: number;
        slug: string;
      }[];
      expect(rows.map((r) => r.slug)).toEqual(['diced', 'sliced']);
    } finally {
      food.raw.close();
    }
  });

  it("only copies slug_registry rows with kind='prep_state' (other kinds belong to legacy)", () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertPrepState(raw, 1, 'Diced', 'diced');
      insertSlug(raw, 'diced', 'prep_state', 1);
      insertSlug(raw, 'tomato', 'ingredient', 99);
      insertSlug(raw, 'pasta-bolognese', 'recipe', 42);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      const rows = food.raw.prepare('SELECT slug, kind FROM slug_registry ORDER BY slug').all() as {
        slug: string;
        kind: string;
      }[];
      expect(rows).toEqual([{ slug: 'diced', kind: 'prep_state' }]);
    } finally {
      food.raw.close();
    }
  });

  it('tolerates a shared DB with no food tables (post-PR-4 drop scenario)', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      expect(() => backfillFoodFromShared(food, sharedPath)).not.toThrow();
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM prep_states').get() as {
        n: number;
      };
      expect(n).toBe(0);
    } finally {
      food.raw.close();
    }
  });
});
