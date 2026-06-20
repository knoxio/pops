/**
 * PRD-108 invariant + FIFO tests — exercises the batch / recipe_run /
 * batch_consumption schema and the consumeForRun + markRunComplete helpers
 * against an in-memory SQLite seeded with PRD-106 + PRD-107 + PRD-108
 * migrations.
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { CannotCookUncompiledRecipe } from '../errors.js';
import { openFoodDb } from '../open-food-db.js';
import { batches, ingredientVariants, recipeVersions } from '../schema.js';
import { consumeForRun, type ConsumptionNeed } from '../services/batches.js';
import { createIngredient } from '../services/ingredients.js';
import { type FoodDb } from '../services/ingredients.js';
import { createRun, markRunComplete } from '../services/recipe-runs.js';
import { createRecipe } from '../services/recipes.js';
import { createVariant } from '../services/variants.js';

import type Database from 'better-sqlite3';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

/**
 * Helper: stand up an ingredient + variant + compiled recipe version, ready
 * for cook tests.
 */
function setupForCook(
  db: FoodDb,
  opts: { shelfLifeFridge?: number | null; shelfLifeFreezer?: number | null } = {}
): { variantId: number; recipeVersionId: number } {
  const ing = createIngredient(db, {
    name: 'Tomato',
    slug: 'tomato',
    defaultUnit: 'g',
  });
  const variant = createVariant(db, {
    ingredientId: ing.id,
    name: 'Diced',
    slug: 'diced',
    defaultUnit: 'g',
  });
  if (opts.shelfLifeFridge !== undefined || opts.shelfLifeFreezer !== undefined) {
    db.update(ingredientVariants)
      .set({
        defaultShelfLifeDaysFridge: opts.shelfLifeFridge ?? null,
        defaultShelfLifeDaysFreezer: opts.shelfLifeFreezer ?? null,
      })
      .where(eq(ingredientVariants.id, variant.id))
      .run();
  }
  const { version } = createRecipe(db, {
    slug: 'tomato-sauce',
    firstVersion: { title: 'Tomato sauce', bodyDsl: '@recipe(tomato-sauce)' },
  });
  db.update(recipeVersions)
    .set({ compileStatus: 'compiled' })
    .where(eq(recipeVersions.id, version.id))
    .run();
  return { variantId: variant.id, recipeVersionId: version.id };
}

describe('PRD-108 — batch model invariants', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('schema applied cleanly', () => {
    it('creates PRD-108 tables', () => {
      const tables = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining(['batches', 'recipe_runs', 'batch_consumptions'])
      );
    });

    it('adds shelf-life columns to ingredient_variants', () => {
      const cols = raw.prepare(`PRAGMA table_info(ingredient_variants)`).all() as {
        name: string;
      }[];
      const names = cols.map((c) => c.name);
      expect(names).toContain('default_shelf_life_days_fridge');
      expect(names).toContain('default_shelf_life_days_freezer');
    });

    it('creates the partial indexes', () => {
      const rows = raw
        .prepare(
          `SELECT name, sql FROM sqlite_master WHERE name IN ('idx_batches_remaining','idx_recipe_runs_complete')`
        )
        .all() as { name: string; sql: string }[];
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.sql).toMatch(/WHERE/i);
      }
    });
  });

  describe('CHECK constraints', () => {
    let variantId: number;
    let recipeVersionId: number;

    beforeEach(() => {
      ({ variantId, recipeVersionId } = setupForCook(db));
    });

    it('rejects qty_remaining = -1 on batches', () => {
      expect(() =>
        raw
          .prepare(
            `INSERT INTO batches (variant_id, qty_remaining, unit, source_type, location, produced_at) VALUES (?, -1, 'g', 'gift', 'fridge', datetime('now'))`
          )
          .run(variantId)
      ).toThrow();
    });

    it('rejects batches.unit outside the enum', () => {
      expect(() =>
        raw
          .prepare(
            `INSERT INTO batches (variant_id, qty_remaining, unit, source_type, location, produced_at) VALUES (?, 1, 'kg', 'gift', 'fridge', datetime('now'))`
          )
          .run(variantId)
      ).toThrow();
    });

    it('rejects recipe_runs.scale_factor = 0', () => {
      expect(() =>
        raw
          .prepare(`INSERT INTO recipe_runs (recipe_version_id, scale_factor) VALUES (?, 0)`)
          .run(recipeVersionId)
      ).toThrow();
    });

    it('rejects recipe_runs.rating outside 1..5', () => {
      expect(() =>
        raw
          .prepare(`INSERT INTO recipe_runs (recipe_version_id, rating) VALUES (?, 7)`)
          .run(recipeVersionId)
      ).toThrow();
    });

    it('accepts recipe_runs.rating = NULL', () => {
      expect(() =>
        raw.prepare(`INSERT INTO recipe_runs (recipe_version_id) VALUES (?)`).run(recipeVersionId)
      ).not.toThrow();
    });

    it('rejects batch_consumptions.qty_consumed = 0', () => {
      const run = createRun(db, { recipeVersionId });
      const batch = raw
        .prepare(
          `INSERT INTO batches (variant_id, qty_remaining, unit, source_type, location, produced_at) VALUES (?, 100, 'g', 'gift', 'fridge', datetime('now')) RETURNING id`
        )
        .get(variantId) as { id: number };
      expect(() =>
        raw
          .prepare(
            `INSERT INTO batch_consumptions (recipe_run_id, batch_id, qty_consumed, unit) VALUES (?, ?, 0, 'g')`
          )
          .run(run.id, batch.id)
      ).toThrow();
    });
  });

  describe('FK enforcement', () => {
    it('refuses to delete an ingredient_variant with extant batches', () => {
      const { variantId } = setupForCook(db);
      raw
        .prepare(
          `INSERT INTO batches (variant_id, qty_remaining, unit, source_type, location, produced_at) VALUES (?, 100, 'g', 'gift', 'fridge', datetime('now'))`
        )
        .run(variantId);
      expect(() =>
        raw.prepare(`DELETE FROM ingredient_variants WHERE id=?`).run(variantId)
      ).toThrow();
    });
  });

  describe('FIFO consumeForRun', () => {
    let variantId: number;
    let recipeVersionId: number;

    beforeEach(() => {
      ({ variantId, recipeVersionId } = setupForCook(db));
    });

    function insertBatch(qty: number, expiresAt: string | null, producedAt: string): number {
      const row = raw
        .prepare(
          `INSERT INTO batches (variant_id, qty_remaining, unit, source_type, location, produced_at, expires_at) VALUES (?, ?, 'g', 'gift', 'fridge', ?, ?) RETURNING id`
        )
        .get(variantId, qty, producedAt, expiresAt) as { id: number };
      return row.id;
    }

    it('consumes the expiry-sooner batch first, then spills into the later one', () => {
      const a = insertBatch(200, '2026-06-09T00:00:00Z', '2026-06-01T00:00:00Z');
      const b = insertBatch(200, '2026-06-15T00:00:00Z', '2026-06-01T00:00:00Z');
      const run = createRun(db, { recipeVersionId });

      const result = consumeForRun(db, run.id, [
        { variantId, prepStateId: null, qty: 300, canonicalUnit: 'g' },
      ]);

      expect(result.ok).toBe(true);
      const updated = db.select().from(batches).all();
      const byId = new Map(updated.map((r) => [r.id, r.qtyRemaining] as const));
      expect(byId.get(a)).toBe(0);
      expect(byId.get(b)).toBe(100);
    });

    it('FIFO falls through to shelf-stable (null expiry) last', () => {
      const stable = insertBatch(200, null, '2026-05-01T00:00:00Z');
      const fresh = insertBatch(200, '2026-06-10T00:00:00Z', '2026-06-01T00:00:00Z');
      const run = createRun(db, { recipeVersionId });

      const result = consumeForRun(db, run.id, [
        { variantId, prepStateId: null, qty: 250, canonicalUnit: 'g' },
      ]);
      expect(result.ok).toBe(true);
      const updated = db.select().from(batches).all();
      const byId = new Map(updated.map((r) => [r.id, r.qtyRemaining] as const));
      // fresh (with expiry) drained first, then 50g from the shelf-stable.
      expect(byId.get(fresh)).toBe(0);
      expect(byId.get(stable)).toBe(150);
    });

    it('shortfall: rolls back all decrements atomically', () => {
      const a = insertBatch(200, '2026-06-09T00:00:00Z', '2026-06-01T00:00:00Z');
      const b = insertBatch(100, '2026-06-15T00:00:00Z', '2026-06-01T00:00:00Z');
      const run = createRun(db, { recipeVersionId });

      const result = consumeForRun(db, run.id, [
        { variantId, prepStateId: null, qty: 500, canonicalUnit: 'g' },
      ]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.shortfalls).toHaveLength(1);
      expect(result.shortfalls[0]?.needed).toBe(500);
      expect(result.shortfalls[0]?.available).toBe(300);

      const updated = db.select().from(batches).all();
      const byId = new Map(updated.map((r) => [r.id, r.qtyRemaining] as const));
      // Untouched: rollback worked.
      expect(byId.get(a)).toBe(200);
      expect(byId.get(b)).toBe(100);
    });

    it('multi-need atomicity: one short need rolls back the other satisfied need', () => {
      // Variant X has enough; variant Y is short. Both rolled back.
      const otherIng = createIngredient(db, {
        name: 'Onion',
        slug: 'onion',
        defaultUnit: 'g',
      });
      const otherVariant = createVariant(db, {
        ingredientId: otherIng.id,
        name: 'Chopped',
        slug: 'chopped',
        defaultUnit: 'g',
      });
      const xBatch = insertBatch(500, null, '2026-06-01T00:00:00Z');
      const yBatch = raw
        .prepare(
          `INSERT INTO batches (variant_id, qty_remaining, unit, source_type, location, produced_at) VALUES (?, 50, 'g', 'gift', 'pantry', datetime('now')) RETURNING id`
        )
        .get(otherVariant.id) as { id: number };

      const run = createRun(db, { recipeVersionId });
      const result = consumeForRun(db, run.id, [
        { variantId, prepStateId: null, qty: 200, canonicalUnit: 'g' },
        { variantId: otherVariant.id, prepStateId: null, qty: 200, canonicalUnit: 'g' },
      ]);

      expect(result.ok).toBe(false);
      const after = db.select().from(batches).all();
      const byId = new Map(after.map((r) => [r.id, r.qtyRemaining] as const));
      expect(byId.get(xBatch)).toBe(500); // untouched despite enough
      expect(byId.get(yBatch.id)).toBe(50);
    });

    it('null prep_state matches a batch with NULL prep_state via IS NULL', () => {
      const matched = insertBatch(100, null, '2026-06-01T00:00:00Z');
      const need: ConsumptionNeed = {
        variantId,
        prepStateId: null,
        qty: 60,
        canonicalUnit: 'g',
      };
      const run = createRun(db, { recipeVersionId });
      const result = consumeForRun(db, run.id, [need]);
      expect(result.ok).toBe(true);
      const after = db
        .select({ qty: batches.qtyRemaining })
        .from(batches)
        .where(eq(batches.id, matched))
        .all();
      expect(after[0]?.qty).toBe(40);
    });
  });

  describe('markRunComplete', () => {
    it('throws CannotCookUncompiledRecipe when the version is uncompiled', () => {
      const { recipe, version } = createRecipe(db, {
        slug: 'pad-thai',
        firstVersion: { title: 'Pad Thai', bodyDsl: '@recipe(pad-thai)' },
      });
      // Version stays uncompiled.
      const run = createRun(db, { recipeVersionId: version.id });
      expect(() => markRunComplete(db, run.id, {})).toThrow(CannotCookUncompiledRecipe);
      void recipe;
    });

    it('sets completed_at and leaves yielded_batch_id null when no yield', () => {
      const { recipeVersionId } = setupForCook(db);
      const run = createRun(db, { recipeVersionId });
      const result = markRunComplete(db, run.id, {});
      expect(result.run.completedAt).not.toBeNull();
      expect(result.run.yieldedBatchId).toBeNull();
      expect(result.yieldedBatch).toBeNull();
    });

    it('creates a yielded batch when yield is given', () => {
      const { variantId, recipeVersionId } = setupForCook(db, { shelfLifeFridge: 7 });
      const run = createRun(db, { recipeVersionId });
      const result = markRunComplete(db, run.id, {
        yield: {
          variantId,
          qty: 500,
          unit: 'g',
          location: 'fridge',
        },
      });
      expect(result.yieldedBatch?.qtyRemaining).toBe(500);
      expect(result.yieldedBatch?.sourceType).toBe('recipe_run');
      expect(result.yieldedBatch?.sourceId).toBe(run.id);
      expect(result.run.yieldedBatchId).toBe(result.yieldedBatch?.id ?? -1);
    });

    it('auto-fills expires_at from default_shelf_life_days_fridge', () => {
      const { variantId, recipeVersionId } = setupForCook(db, { shelfLifeFridge: 7 });
      const run = createRun(db, { recipeVersionId });
      const completedAt = '2026-06-08T12:00:00.000Z';
      const result = markRunComplete(db, run.id, {
        completedAt,
        yield: { variantId, qty: 500, unit: 'g', location: 'fridge' },
      });
      expect(result.yieldedBatch?.expiresAt).toBe('2026-06-15T12:00:00.000Z');
    });

    it('leaves expires_at NULL when location=pantry', () => {
      const { variantId, recipeVersionId } = setupForCook(db, { shelfLifeFridge: 7 });
      const run = createRun(db, { recipeVersionId });
      const result = markRunComplete(db, run.id, {
        yield: { variantId, qty: 500, unit: 'g', location: 'pantry' },
      });
      expect(result.yieldedBatch?.expiresAt).toBeNull();
    });

    it('explicit expiresAt overrides the shelf-life default', () => {
      const { variantId, recipeVersionId } = setupForCook(db, { shelfLifeFridge: 7 });
      const run = createRun(db, { recipeVersionId });
      const result = markRunComplete(db, run.id, {
        yield: {
          variantId,
          qty: 500,
          unit: 'g',
          location: 'fridge',
          expiresAt: '2027-01-01T00:00:00.000Z',
        },
      });
      expect(result.yieldedBatch?.expiresAt).toBe('2027-01-01T00:00:00.000Z');
    });
  });
});
