/**
 * Boot-time backfill tests for `backfillFoodFromShared` — Theme-13 Wave-5
 * PR4 conversions + ingredients slices.
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * food pillar's `food.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). The conversions slice carries `unit_conversions`
 * and `ingredient_weights`; the ingredients slice carries `ingredients`,
 * `ingredient_variants`, `ingredient_aliases`, `ingredient_tags`, and
 * the food-owned (`kind IN ('ingredient','prep_state')`) rows of
 * `slug_registry`.
 *
 * Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the per-table WHERE filter dedupes),
 *   - mixed state (some rows already in food.db) only inserts the missing ones,
 *   - the null-variant `ingredient_weights` row deduplicates correctly under
 *     SQLite's NULL-distinct join semantics (handled via `IS` not `=`),
 *   - `slug_registry` copy is kind-scoped — `kind='recipe'` rows stay on the
 *     shared DB (those still belong on pops.db until the recipes writer flips),
 *     `kind='prep_state'` rows are tolerated (they may already be on food.db
 *     from the earlier PR4 round),
 *   - missing source tables are tolerated without throwing,
 *   - the FK cascade from `ingredient_tags` is preserved post-copy.
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

const INGREDIENTS_SQL = `
CREATE TABLE ingredients (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  parent_id integer,
  name text NOT NULL,
  slug text NOT NULL,
  default_unit text NOT NULL,
  density_g_per_ml real,
  notes text,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES ingredients(id)
);
CREATE UNIQUE INDEX ingredients_slug_unique ON ingredients (slug);
`;

const INGREDIENT_VARIANTS_SQL = `
CREATE TABLE ingredient_variants (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  ingredient_id integer NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  default_unit text NOT NULL,
  package_size_g real,
  notes text,
  default_shelf_life_days_fridge integer,
  default_shelf_life_days_freezer integer,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);
CREATE UNIQUE INDEX uq_variants_ingredient_slug ON ingredient_variants (ingredient_id, slug);
`;

const INGREDIENT_ALIASES_SQL = `
CREATE TABLE ingredient_aliases (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  ingredient_id integer,
  variant_id integer,
  alias text NOT NULL,
  source text NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  FOREIGN KEY (variant_id) REFERENCES ingredient_variants(id)
);
CREATE UNIQUE INDEX uq_aliases_alias_ingredient
  ON ingredient_aliases (alias, ingredient_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX uq_aliases_alias_variant
  ON ingredient_aliases (alias, variant_id) WHERE ingredient_id IS NULL;
`;

const INGREDIENT_TAGS_SQL = `
CREATE TABLE ingredient_tags (
  ingredient_id integer NOT NULL,
  tag text NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  PRIMARY KEY(ingredient_id, tag),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE cascade
);
`;

const SLUG_REGISTRY_SQL = `
CREATE TABLE slug_registry (
  slug text PRIMARY KEY NOT NULL,
  kind text NOT NULL,
  target_id integer NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX idx_slug_registry_kind_target ON slug_registry (kind, target_id);
`;

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(UNIT_CONVERSIONS_SQL);
  raw.exec(INGREDIENT_WEIGHTS_SQL);
  raw.exec(INGREDIENTS_SQL);
  raw.exec(INGREDIENT_VARIANTS_SQL);
  raw.exec(INGREDIENT_ALIASES_SQL);
  raw.exec(INGREDIENT_TAGS_SQL);
  raw.exec(SLUG_REGISTRY_SQL);
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

function insertIngredient(
  raw: BetterSqlite3.Database,
  id: number,
  slug: string,
  name: string
): void {
  raw
    .prepare(
      `INSERT INTO ingredients (id, name, slug, default_unit, created_at)
       VALUES (?, ?, ?, 'count', '2026-06-13T00:00:00Z')`
    )
    .run(id, name, slug);
}

function insertSlug(
  raw: BetterSqlite3.Database,
  slug: string,
  kind: string,
  targetId: number
): void {
  raw
    .prepare(
      `INSERT INTO slug_registry (slug, kind, target_id, created_at)
       VALUES (?, ?, ?, '2026-06-13T00:00:00Z')`
    )
    .run(slug, kind, targetId);
}

describe('backfillFoodFromShared — conversions slice', () => {
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

describe('backfillFoodFromShared — ingredients slice', () => {
  it('copies ingredients rows from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredient(raw, 1, 'banana', 'Banana');
      insertIngredient(raw, 2, 'apple', 'Apple');
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      const rows = food.raw.prepare('SELECT id, slug, name FROM ingredients ORDER BY id').all() as {
        id: number;
        slug: string;
        name: string;
      }[];
      expect(rows).toEqual([
        { id: 1, slug: 'banana', name: 'Banana' },
        { id: 2, slug: 'apple', name: 'Apple' },
      ]);
    } finally {
      food.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate ingredients rows', () => {
    const sharedPath = openSharedWithSeed((raw) => insertIngredient(raw, 1, 'banana', 'Banana'));

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      backfillFoodFromShared(food, sharedPath);
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM ingredients').get() as {
        n: number;
      };
      expect(n).toBe(1);
    } finally {
      food.raw.close();
    }
  });

  it('only inserts ingredients rows missing from the food copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredient(raw, 1, 'banana', 'Banana');
      insertIngredient(raw, 2, 'apple', 'Apple');
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      food.raw
        .prepare(
          `INSERT INTO ingredients (id, name, slug, default_unit, created_at)
           VALUES (2, 'Apple (local)', 'apple', 'count', '2026-06-14T00:00:00Z')`
        )
        .run();
      backfillFoodFromShared(food, sharedPath);

      const rows = food.raw.prepare('SELECT id, name FROM ingredients ORDER BY id').all() as {
        id: number;
        name: string;
      }[];
      expect(rows).toEqual([
        { id: 1, name: 'Banana' },
        { id: 2, name: 'Apple (local)' },
      ]);
    } finally {
      food.raw.close();
    }
  });

  it('copies variants + aliases + tags following the ingredients copy', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredient(raw, 1, 'banana', 'Banana');
      raw
        .prepare(
          `INSERT INTO ingredient_variants
            (id, ingredient_id, name, slug, default_unit, package_size_g,
             default_shelf_life_days_fridge, default_shelf_life_days_freezer, created_at)
           VALUES (10, 1, 'Cavendish', 'cavendish', 'count', 120, 7, 90,
                   '2026-06-13T00:00:00Z')`
        )
        .run();
      raw
        .prepare(
          `INSERT INTO ingredient_aliases
            (id, ingredient_id, variant_id, alias, source, created_at)
           VALUES (100, 1, NULL, 'nana', 'user', '2026-06-13T00:00:00Z')`
        )
        .run();
      raw
        .prepare(
          `INSERT INTO ingredient_tags (ingredient_id, tag, created_at)
           VALUES (1, 'store-section:produce', '2026-06-13T00:00:00Z')`
        )
        .run();
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);

      const variants = food.raw
        .prepare(
          'SELECT id, ingredient_id, slug, default_shelf_life_days_fridge FROM ingredient_variants'
        )
        .all() as {
        id: number;
        ingredient_id: number;
        slug: string;
        default_shelf_life_days_fridge: number | null;
      }[];
      expect(variants).toEqual([
        { id: 10, ingredient_id: 1, slug: 'cavendish', default_shelf_life_days_fridge: 7 },
      ]);

      const aliases = food.raw
        .prepare('SELECT id, alias, source FROM ingredient_aliases')
        .all() as { id: number; alias: string; source: string }[];
      expect(aliases).toEqual([{ id: 100, alias: 'nana', source: 'user' }]);

      const tags = food.raw.prepare('SELECT ingredient_id, tag FROM ingredient_tags').all() as {
        ingredient_id: number;
        tag: string;
      }[];
      expect(tags).toEqual([{ ingredient_id: 1, tag: 'store-section:produce' }]);
    } finally {
      food.raw.close();
    }
  });

  it('only copies kind=ingredient and kind=prep_state rows from slug_registry — kind=recipe stays on pops.db', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredient(raw, 1, 'banana', 'Banana');
      insertSlug(raw, 'banana', 'ingredient', 1);
      insertSlug(raw, 'banana-bread', 'recipe', 99);
      insertSlug(raw, 'diced', 'prep_state', 7);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      const rows = food.raw
        .prepare('SELECT slug, kind, target_id FROM slug_registry ORDER BY slug')
        .all() as { slug: string; kind: string; target_id: number }[];
      expect(rows).toEqual([
        { slug: 'banana', kind: 'ingredient', target_id: 1 },
        { slug: 'diced', kind: 'prep_state', target_id: 7 },
      ]);
    } finally {
      food.raw.close();
    }
  });

  it('slug_registry backfill is idempotent', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredient(raw, 1, 'banana', 'Banana');
      insertSlug(raw, 'banana', 'ingredient', 1);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      backfillFoodFromShared(food, sharedPath);
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM slug_registry').get() as {
        n: number;
      };
      expect(n).toBe(1);
    } finally {
      food.raw.close();
    }
  });

  it('slug_registry copy does not clobber an existing food-side row for the same slug', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredient(raw, 1, 'banana', 'Banana');
      insertSlug(raw, 'banana', 'ingredient', 1);
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      food.raw
        .prepare(
          `INSERT INTO slug_registry (slug, kind, target_id, created_at)
           VALUES ('banana', 'ingredient', 999, '2026-06-14T00:00:00Z')`
        )
        .run();
      backfillFoodFromShared(food, sharedPath);
      const rows = food.raw.prepare('SELECT slug, target_id FROM slug_registry').all() as {
        slug: string;
        target_id: number;
      }[];
      expect(rows).toEqual([{ slug: 'banana', target_id: 999 }]);
    } finally {
      food.raw.close();
    }
  });

  it('preserves the ingredient_tags ON DELETE CASCADE after the copy', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertIngredient(raw, 1, 'banana', 'Banana');
      raw
        .prepare(
          `INSERT INTO ingredient_tags (ingredient_id, tag, created_at)
           VALUES (1, 'vegan', '2026-06-13T00:00:00Z')`
        )
        .run();
    });

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      backfillFoodFromShared(food, sharedPath);
      food.raw.prepare('DELETE FROM ingredients WHERE id = 1').run();
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM ingredient_tags').get() as {
        n: number;
      };
      expect(n).toBe(0);
    } finally {
      food.raw.close();
    }
  });

  it('tolerates a shared DB with no ingredient tables (post-PR4-drop scenario)', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const food = openFoodDb(join(tmpDir, 'food.db'));
    try {
      expect(() => backfillFoodFromShared(food, sharedPath)).not.toThrow();
      const { n } = food.raw.prepare('SELECT count(*) AS n FROM ingredients').get() as {
        n: number;
      };
      expect(n).toBe(0);
    } finally {
      food.raw.close();
    }
  });
});
