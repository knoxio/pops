/**
 * Boot-time backfill tests for `backfillFoodFromShared`.
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * food pillar's `food.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). The Theme-13 Wave-5 conversions PR4 carries
 * `unit_conversions` and `ingredient_weights` across; the existing
 * prep_states slice already lives in food.db so it is not in scope here.
 *
 * Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the per-table WHERE filter dedupes),
 *   - mixed state (some rows already in food.db) only inserts the missing ones,
 *   - the null-variant `ingredient_weights` row deduplicates correctly under
 *     SQLite's NULL-distinct join semantics (handled via `IS` not `=`),
 *   - missing source tables are tolerated without throwing.
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

const UNIT_CONVERSIONS_SQL = `
CREATE TABLE unit_conversions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  ratio real NOT NULL,
  notes text,
  is_seeded integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX uq_unit_conversions_from_to ON unit_conversions (from_unit, to_unit);
`;

const INGREDIENT_WEIGHTS_SQL = `
CREATE TABLE ingredient_weights (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  ingredient_id integer NOT NULL,
  variant_id integer,
  unit text NOT NULL,
  grams real NOT NULL,
  notes text,
  is_seeded integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX uq_ingredient_weights_with_variant
  ON ingredient_weights (ingredient_id, variant_id, unit) WHERE variant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_ingredient_weights_any_variant
  ON ingredient_weights (ingredient_id, unit) WHERE variant_id IS NULL;
`;

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(UNIT_CONVERSIONS_SQL);
  raw.exec(INGREDIENT_WEIGHTS_SQL);
  seed(raw);
  raw.close();
  return path;
}

function insertUnitConversion(
  raw: BetterSqlite3.Database,
  fromUnit: string,
  toUnit: 'g' | 'ml' | 'count',
  ratio: number,
  isSeeded = 0
): void {
  raw
    .prepare(
      `INSERT INTO unit_conversions (from_unit, to_unit, ratio, is_seeded, created_at)
       VALUES (?, ?, ?, ?, '2026-06-13T00:00:00Z')`
    )
    .run(fromUnit, toUnit, ratio, isSeeded);
}

function insertIngredientWeight(
  raw: BetterSqlite3.Database,
  ingredientId: number,
  variantId: number | null,
  unit: string,
  grams: number
): void {
  raw
    .prepare(
      `INSERT INTO ingredient_weights
        (ingredient_id, variant_id, unit, grams, is_seeded, created_at)
       VALUES (?, ?, ?, ?, 0, '2026-06-13T00:00:00Z')`
    )
    .run(ingredientId, variantId, unit, grams);
}

describe('backfillFoodFromShared', () => {
  it('copies unit_conversions rows from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertUnitConversion(raw, 'cup', 'ml', 240);
      insertUnitConversion(raw, 'tbsp', 'ml', 15, 1);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      const rows = food.raw
        .prepare(
          'SELECT from_unit, to_unit, ratio, is_seeded FROM unit_conversions ORDER BY from_unit'
        )
        .all() as { from_unit: string; to_unit: string; ratio: number; is_seeded: number }[];
      expect(rows).toEqual([
        { from_unit: 'cup', to_unit: 'ml', ratio: 240, is_seeded: 0 },
        { from_unit: 'tbsp', to_unit: 'ml', ratio: 15, is_seeded: 1 },
      ]);
    } finally {
      food.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate rows', () => {
    const sharedPath = openSharedWithSeed((raw) => insertUnitConversion(raw, 'cup', 'ml', 240));

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      backfillFoodFromShared(food, sharedPath);
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM unit_conversions').get() as {
        n: number;
      };
      expect(n).toBe(1);
    } finally {
      food.raw.close();
    }
  });

  it('only inserts unit_conversions rows missing from the food copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertUnitConversion(raw, 'cup', 'ml', 240);
      insertUnitConversion(raw, 'tbsp', 'ml', 15);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      food.raw
        .prepare(
          `INSERT INTO unit_conversions (from_unit, to_unit, ratio, is_seeded, created_at)
           VALUES ('tbsp', 'ml', 14.79, 0, '2026-06-14T00:00:00Z')`
        )
        .run();
      backfillFoodFromShared(food, sharedPath);

      const rows = food.raw
        .prepare('SELECT from_unit, ratio FROM unit_conversions ORDER BY from_unit')
        .all() as { from_unit: string; ratio: number }[];
      expect(rows).toEqual([
        { from_unit: 'cup', ratio: 240 },
        { from_unit: 'tbsp', ratio: 14.79 },
      ]);
    } finally {
      food.raw.close();
    }
  });

  it('copies ingredient_weights rows including null-variant rows', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredientWeight(raw, 1, null, 'medium', 50);
      insertIngredientWeight(raw, 1, 2, 'clove', 5);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      const rows = food.raw
        .prepare(
          'SELECT ingredient_id, variant_id, unit, grams FROM ingredient_weights ORDER BY unit'
        )
        .all() as {
        ingredient_id: number;
        variant_id: number | null;
        unit: string;
        grams: number;
      }[];
      expect(rows).toEqual([
        { ingredient_id: 1, variant_id: 2, unit: 'clove', grams: 5 },
        { ingredient_id: 1, variant_id: null, unit: 'medium', grams: 50 },
      ]);
    } finally {
      food.raw.close();
    }
  });

  it('ingredient_weights backfill is idempotent for both null-variant and variant-bound rows', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredientWeight(raw, 1, null, 'medium', 50);
      insertIngredientWeight(raw, 1, 2, 'clove', 5);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      backfillFoodFromShared(food, sharedPath);
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM ingredient_weights').get() as {
        n: number;
      };
      expect(n).toBe(2);
    } finally {
      food.raw.close();
    }
  });

  it('only inserts ingredient_weights rows missing from the food copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredientWeight(raw, 1, null, 'medium', 50);
      insertIngredientWeight(raw, 1, 2, 'clove', 5);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      // The food side already has its own row for (1, NULL, 'medium') with a
      // different gram value — the backfill must NOT clobber it.
      food.raw
        .prepare(
          `INSERT INTO ingredient_weights (ingredient_id, variant_id, unit, grams, is_seeded, created_at)
           VALUES (1, NULL, 'medium', 55, 0, '2026-06-14T00:00:00Z')`
        )
        .run();
      backfillFoodFromShared(food, sharedPath);

      const rows = food.raw
        .prepare(
          'SELECT ingredient_id, variant_id, unit, grams FROM ingredient_weights ORDER BY unit'
        )
        .all() as {
        ingredient_id: number;
        variant_id: number | null;
        unit: string;
        grams: number;
      }[];
      expect(rows).toEqual([
        { ingredient_id: 1, variant_id: 2, unit: 'clove', grams: 5 },
        { ingredient_id: 1, variant_id: null, unit: 'medium', grams: 55 },
      ]);
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
      const { n: u } = food.raw.prepare('SELECT count(*) AS n FROM unit_conversions').get() as {
        n: number;
      };
      const { n: w } = food.raw.prepare('SELECT count(*) AS n FROM ingredient_weights').get() as {
        n: number;
      };
      expect(u).toBe(0);
      expect(w).toBe(0);
    } finally {
      food.raw.close();
    }
  });

  it('tolerates a missing shared DB path without throwing', () => {
    const sharedPath = join(tmpDir, 'does-not-exist.db');
    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      expect(() => backfillFoodFromShared(food, sharedPath)).not.toThrow();
    } finally {
      food.raw.close();
    }
  });
});
