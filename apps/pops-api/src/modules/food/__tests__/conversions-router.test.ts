/**
 * PRD-123 Phase B — integration tests for `food.conversions.*`.
 *
 * Spins up an in-memory SQLite with the food schema migrations the
 * conversions tables depend on (0058 ingredients → 0059 recipes → 0060
 * batches/variant ALTER → 0066 conversions), wires it into `getDb()` via
 * `setDb`, and exercises every procedure end-to-end through an `appRouter`
 * caller. Coverage: boolean `seeded` round-trip, idempotent delete on
 * unknown id, `SeededRowProtected` → discriminated `{ ok:false,
 * reason:'seeded' }` short-circuit, UNIQUE → tRPC `CONFLICT` mapping on
 * create, `expectRow` → tRPC `NOT_FOUND` mapping on update, Zod-boundary
 * rejection, `seededOnly` filter on listWeights, and every resolve path
 * (identity / unit-conversion / weight wins over unit / variant wins over
 * null-variant / null-variant fallback / unresolved).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { setFoodDb } from '../../../db/food-handle.js';
import { createCaller } from '../../../shared/test-utils.js';

const MIGRATION_FILES = [
  // PRD-106 ingredients + variants + slug_registry
  '0058_high_sentinel.sql',
  // PRD-107 recipes (prereq for 0060's recipe_runs FK)
  '0059_useful_hiroim.sql',
  // PRD-108 ALTER ingredient_variants (shelf-life cols) + batches/recipe_runs
  '0060_familiar_leo.sql',
  // PRD-123 unit_conversions + ingredient_weights
  '0066_prd_123_conversions.sql',
];

function applyMigration(db: Database, filename: string): void {
  const sql = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

function createFoodTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATION_FILES) applyMigration(db, name);
  return db;
}

/** Insert an ingredient row directly via raw SQL rather than going through
 *  `ingredientsService.createIngredient` — the service auto-registers a
 *  slug, and these tests want full control over the (ingredient,
 *  slug_registry) pair to mirror the minimal invariant PRD-106 declares. */
function seedIngredient(
  db: Database,
  name: string,
  slug: string,
  defaultUnit: 'g' | 'ml' | 'count' = 'g'
): number {
  const row = db
    .prepare(`INSERT INTO ingredients (name, slug, default_unit) VALUES (?, ?, ?) RETURNING id`)
    .get(name, slug, defaultUnit) as { id: number };
  db.prepare(`INSERT INTO slug_registry (slug, kind, target_id) VALUES (?, 'ingredient', ?)`).run(
    slug,
    row.id
  );
  return row.id;
}

/** Variants are scoped to their parent ingredient via uq_variants_ingredient_slug;
 *  they do NOT have their own slug_registry row. */
function seedVariant(db: Database, ingredientId: number, slug: string, name: string): number {
  const row = db
    .prepare(
      `INSERT INTO ingredient_variants (ingredient_id, name, slug, default_unit) VALUES (?, ?, ?, 'g') RETURNING id`
    )
    .get(ingredientId, name, slug) as { id: number };
  return row.id;
}

/** Insert a seeded unit_conversion row directly so the `is_seeded=1` path
 *  is exercised — the createUnit procedure deliberately forces is_seeded=0. */
function seedUnitConversion(
  db: Database,
  fromUnit: string,
  toUnit: 'g' | 'ml' | 'count',
  ratio: number
): number {
  const row = db
    .prepare(
      `INSERT INTO unit_conversions (from_unit, to_unit, ratio, is_seeded) VALUES (?, ?, ?, 1) RETURNING id`
    )
    .get(fromUnit, toUnit, ratio) as { id: number };
  return row.id;
}

let db: Database;
let caller: ReturnType<typeof createCaller>;

beforeEach(() => {
  db = createFoodTestDb();
  setDb(db);
  // Theme-13 Wave-5 PR4: the conversions router now resolves
  // `getFoodDrizzle()`. Point the food-handle at the same in-memory
  // fixture so writes land in the test DB instead of lazy-opening
  // `data/food.db` mid-suite.
  setFoodDb({ db: drizzle(db), raw: db });
  caller = createCaller(true);
});

afterEach(() => {
  setFoodDb(null);
  closeDb();
});

describe('food.conversions.listUnits', () => {
  it('returns empty list when no rows', async () => {
    const result = await caller.food.conversions.listUnits();
    expect(result.items).toEqual([]);
  });

  it('returns user-added rows with seeded=false', async () => {
    await caller.food.conversions.createUnit({ fromUnit: 'cup', toUnit: 'ml', ratio: 240 });
    const result = await caller.food.conversions.listUnits();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      fromUnit: 'cup',
      toUnit: 'ml',
      ratio: 240,
      seeded: false,
    });
  });

  it('seededOnly filters out user rows', async () => {
    seedUnitConversion(db, 'cup', 'ml', 240);
    await caller.food.conversions.createUnit({ fromUnit: 'tbsp', toUnit: 'ml', ratio: 15 });

    const all = await caller.food.conversions.listUnits();
    expect(all.items).toHaveLength(2);

    const seededOnly = await caller.food.conversions.listUnits({ seededOnly: true });
    expect(seededOnly.items).toHaveLength(1);
    expect(seededOnly.items[0]?.fromUnit).toBe('cup');
    expect(seededOnly.items[0]?.seeded).toBe(true);
  });

  it('search matches against from_unit and to_unit', async () => {
    await caller.food.conversions.createUnit({ fromUnit: 'cup', toUnit: 'ml', ratio: 240 });
    await caller.food.conversions.createUnit({ fromUnit: 'oz', toUnit: 'g', ratio: 28.35 });

    const cup = await caller.food.conversions.listUnits({ search: 'cup' });
    expect(cup.items.map((r) => r.fromUnit)).toEqual(['cup']);

    const g = await caller.food.conversions.listUnits({ search: 'g' });
    expect(g.items.map((r) => r.fromUnit)).toEqual(['oz']);
  });
});

describe('food.conversions.createUnit', () => {
  it('returns the inserted row with seeded=false', async () => {
    const { data } = await caller.food.conversions.createUnit({
      fromUnit: 'tsp',
      toUnit: 'ml',
      ratio: 5,
      notes: 'metric teaspoon',
    });
    expect(data).toMatchObject({
      fromUnit: 'tsp',
      toUnit: 'ml',
      ratio: 5,
      notes: 'metric teaspoon',
      seeded: false,
    });
    expect(data.id).toBeGreaterThan(0);
  });

  it('rejects ratio <= 0 at the Zod boundary', async () => {
    await expect(
      caller.food.conversions.createUnit({ fromUnit: 'bad', toUnit: 'ml', ratio: 0 })
    ).rejects.toThrow();
  });

  it('maps a duplicate (from_unit, to_unit) UNIQUE failure to tRPC CONFLICT', async () => {
    await caller.food.conversions.createUnit({ fromUnit: 'tbsp', toUnit: 'ml', ratio: 15 });
    await expect(
      caller.food.conversions.createUnit({ fromUnit: 'tbsp', toUnit: 'ml', ratio: 14.79 })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('food.conversions.updateUnit', () => {
  it('patches ratio + notes and returns the new row', async () => {
    const { data: created } = await caller.food.conversions.createUnit({
      fromUnit: 'tbsp',
      toUnit: 'ml',
      ratio: 15,
    });
    const { data: updated } = await caller.food.conversions.updateUnit({
      id: created.id,
      ratio: 14.79,
      notes: 'metric, AU bias',
    });
    expect(updated.ratio).toBe(14.79);
    expect(updated.notes).toBe('metric, AU bias');
  });

  it('maps an unknown-id update to tRPC NOT_FOUND', async () => {
    // Phase A's `conversionsService.updateUnitConversion` throws an
    // `expectRow` miss; the router's `runUpdate` helper translates that
    // to a typed NOT_FOUND so clients can branch on the error code instead
    // of pattern-matching message strings.
    await expect(caller.food.conversions.updateUnit({ id: 9999, ratio: 1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('food.conversions.deleteUnit', () => {
  it('deletes a user-added row and returns ok:true', async () => {
    const { data } = await caller.food.conversions.createUnit({
      fromUnit: 'each',
      toUnit: 'count',
      ratio: 1,
    });
    const result = await caller.food.conversions.deleteUnit({ id: data.id });
    expect(result).toEqual({ ok: true });
    const after = await caller.food.conversions.listUnits();
    expect(after.items).toHaveLength(0);
  });

  it('short-circuits seeded rows with ok:false / reason:seeded', async () => {
    const id = seedUnitConversion(db, 'cup', 'ml', 240);
    const result = await caller.food.conversions.deleteUnit({ id });
    expect(result).toEqual({ ok: false, reason: 'seeded' });
    const after = await caller.food.conversions.listUnits();
    expect(after.items).toHaveLength(1);
    expect(after.items[0]?.seeded).toBe(true);
  });

  it('is idempotent for unknown ids (Phase A contract)', async () => {
    // `conversionsService.deleteUnitConversion` silently no-ops when the
    // row is missing — Phase A chose the idempotent shape over throw, so
    // refreshing a stale UI page after another tab deleted the row doesn't
    // raise an error toast.
    const result = await caller.food.conversions.deleteUnit({ id: 9999 });
    expect(result).toEqual({ ok: true });
  });
});

describe('food.conversions.{create,list,update,delete}Weight', () => {
  it('round-trips a per-ingredient weight (null variant)', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    const { data } = await caller.food.conversions.createWeight({
      ingredientId: onionId,
      unit: 'medium',
      grams: 150,
    });
    expect(data).toMatchObject({
      ingredientId: onionId,
      variantId: null,
      unit: 'medium',
      grams: 150,
      seeded: false,
    });

    const list = await caller.food.conversions.listWeights({ ingredientId: onionId });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(data.id);

    const { data: updated } = await caller.food.conversions.updateWeight({
      id: data.id,
      grams: 160,
    });
    expect(updated.grams).toBe(160);

    const del = await caller.food.conversions.deleteWeight({ id: data.id });
    expect(del).toEqual({ ok: true });
  });

  it('stores per-variant rows and the list filter applies', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    const redId = seedVariant(db, onionId, 'onion:red', 'red');
    await caller.food.conversions.createWeight({
      ingredientId: onionId,
      variantId: redId,
      unit: 'medium',
      grams: 175,
    });
    await caller.food.conversions.createWeight({
      ingredientId: onionId,
      unit: 'medium',
      grams: 150,
    });

    const list = await caller.food.conversions.listWeights({ ingredientId: onionId });
    expect(list.items).toHaveLength(2);
    const variants = list.items.map((r) => r.variantId);
    expect(variants).toContain(redId);
    expect(variants).toContain(null);
  });

  it('maps a duplicate (ingredient, variant, unit) UNIQUE failure to tRPC CONFLICT', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    await caller.food.conversions.createWeight({
      ingredientId: onionId,
      unit: 'medium',
      grams: 150,
    });
    await expect(
      caller.food.conversions.createWeight({
        ingredientId: onionId,
        unit: 'medium',
        grams: 160,
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('deleteWeight on a seeded row short-circuits with ok:false', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    const seededWeightId = (
      db
        .prepare(
          `INSERT INTO ingredient_weights (ingredient_id, variant_id, unit, grams, is_seeded) VALUES (?, NULL, 'medium', 150, 1) RETURNING id`
        )
        .get(onionId) as { id: number }
    ).id;
    const result = await caller.food.conversions.deleteWeight({ id: seededWeightId });
    expect(result).toEqual({ ok: false, reason: 'seeded' });
  });

  it('updateWeight on an unknown id maps to tRPC NOT_FOUND', async () => {
    await expect(
      caller.food.conversions.updateWeight({ id: 9999, grams: 1 })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('listWeights honours the seededOnly toggle', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    // One user-added + one seeded; seededOnly must return only the seeded row.
    await caller.food.conversions.createWeight({
      ingredientId: onionId,
      unit: 'medium',
      grams: 150,
    });
    db.prepare(
      `INSERT INTO ingredient_weights (ingredient_id, variant_id, unit, grams, is_seeded) VALUES (?, NULL, 'large', 200, 1)`
    ).run(onionId);

    const all = await caller.food.conversions.listWeights({ ingredientId: onionId });
    expect(all.items).toHaveLength(2);

    const seededOnly = await caller.food.conversions.listWeights({
      ingredientId: onionId,
      seededOnly: true,
    });
    expect(seededOnly.items).toHaveLength(1);
    expect(seededOnly.items[0]?.unit).toBe('large');
    expect(seededOnly.items[0]?.seeded).toBe(true);
  });
});

describe('food.conversions.resolve', () => {
  it('identity carry-over: g unit yields qty unchanged with canonicalUnit=g', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    const result = await caller.food.conversions.resolve({
      ingredientId: onionId,
      unit: 'g',
      qty: 250,
    });
    expect(result).toEqual({ kind: 'resolved', canonicalUnit: 'g', qty: 250 });
  });

  it('falls back to unit_conversions when no ingredient_weight matches', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    await caller.food.conversions.createUnit({ fromUnit: 'cup', toUnit: 'ml', ratio: 240 });
    const result = await caller.food.conversions.resolve({
      ingredientId: onionId,
      unit: 'cup',
      qty: 0.5,
    });
    expect(result).toEqual({ kind: 'resolved', canonicalUnit: 'ml', qty: 120 });
  });

  it('ingredient_weight beats unit_conversion for the same unit', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    await caller.food.conversions.createUnit({ fromUnit: 'medium', toUnit: 'count', ratio: 1 });
    await caller.food.conversions.createWeight({
      ingredientId: onionId,
      unit: 'medium',
      grams: 150,
    });
    const result = await caller.food.conversions.resolve({
      ingredientId: onionId,
      unit: 'medium',
      qty: 2,
    });
    expect(result).toEqual({ kind: 'resolved', canonicalUnit: 'g', qty: 300 });
  });

  it('variant-specific weight wins over null-variant for the same (ingredient, unit)', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    const redId = seedVariant(db, onionId, 'onion:red', 'red');
    await caller.food.conversions.createWeight({
      ingredientId: onionId,
      unit: 'medium',
      grams: 150,
    });
    await caller.food.conversions.createWeight({
      ingredientId: onionId,
      variantId: redId,
      unit: 'medium',
      grams: 175,
    });
    const result = await caller.food.conversions.resolve({
      ingredientId: onionId,
      variantId: redId,
      unit: 'medium',
      qty: 2,
    });
    expect(result).toEqual({ kind: 'resolved', canonicalUnit: 'g', qty: 350 });
  });

  it('falls back from a variant-specific lookup to the null-variant row', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    const redId = seedVariant(db, onionId, 'onion:red', 'red');
    await caller.food.conversions.createWeight({
      ingredientId: onionId,
      unit: 'medium',
      grams: 150,
    });
    const result = await caller.food.conversions.resolve({
      ingredientId: onionId,
      variantId: redId,
      unit: 'medium',
      qty: 1,
    });
    expect(result).toEqual({ kind: 'resolved', canonicalUnit: 'g', qty: 150 });
  });

  it('unresolved when no row covers the unit', async () => {
    const onionId = seedIngredient(db, 'Onion', 'onion');
    const result = await caller.food.conversions.resolve({
      ingredientId: onionId,
      unit: 'packets',
      qty: 5,
    });
    expect(result).toEqual({ kind: 'unresolved' });
  });
});
