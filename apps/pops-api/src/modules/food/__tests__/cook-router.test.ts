/**
 * PRD-144 — integration tests for `food.cook.*`.
 *
 * Covers the cook event happy path, every `MarkCookedError` branch, the
 * shortfall-rollback contract, plan-entry linkage + race, and override
 * processing (PRD-146's deferred slice).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  batchConsumptions,
  batches,
  ingredientsService,
  ingredientVariants,
  planEntries,
  planSlots,
  recipeLines,
  recipeRuns,
  recipesService,
  recipeVersions,
  variantsService,
} from '@pops/app-food-db';

import { closeDb, getDrizzle, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';

const MIGRATION_FILES = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0061_shocking_skreet.sql',
  '0062_chemical_donald_blake.sql',
  '0063_bumpy_wolverine.sql',
  '0064_peaceful_magma.sql',
  '0065_prd_116_recipe_compile.sql',
  '0066_prd_123_conversions.sql',
  '0067_prd_125_ingest_error_columns.sql',
  '0068_prd_136_inbox_review.sql',
  '0069_prd_145_batches_deleted_at.sql',
];

function applyMigration(db: Database, filename: string): void {
  const text = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of text.split('--> statement-breakpoint')) {
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

interface SeededRecipe {
  recipeId: number;
  versionId: number;
  ingredientId: number;
  variantId: number;
  yieldVariantId: number;
}

function seedCompiledRecipe(slug: string, opts: { yields?: boolean } = {}): SeededRecipe {
  const db = getDrizzle();
  const yields = opts.yields ?? true;
  const ing = ingredientsService.createIngredient(db, {
    name: 'Tomato',
    slug: `${slug}-tomato`,
    defaultUnit: 'g',
  });
  const variant = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: 'Diced',
    slug: `${slug}-diced`,
    defaultUnit: 'g',
  });
  db.update(ingredientVariants)
    .set({ defaultShelfLifeDaysFridge: 5, defaultShelfLifeDaysFreezer: 90 })
    .where(eq(ingredientVariants.id, variant.id))
    .run();

  let yieldVariantId = variant.id;
  if (yields) {
    const yieldIng = ingredientsService.createIngredient(db, {
      name: 'Sauce',
      slug: `${slug}-sauce`,
      defaultUnit: 'g',
    });
    const yieldVar = variantsService.createVariant(db, {
      ingredientId: yieldIng.id,
      name: 'Default',
      slug: `${slug}-sauce-default`,
      defaultUnit: 'g',
    });
    db.update(ingredientVariants)
      .set({ defaultShelfLifeDaysFridge: 3, defaultShelfLifeDaysFreezer: 60 })
      .where(eq(ingredientVariants.id, yieldVar.id))
      .run();
    yieldVariantId = yieldVar.id;
  }

  const { recipe, version } = recipesService.createRecipe(db, {
    slug,
    firstVersion: { title: `Test ${slug}`, bodyDsl: `@recipe(slug="${slug}", title="Test")` },
  });
  void recipe;
  db.update(recipeVersions)
    .set({
      compileStatus: 'compiled',
      compiledAt: new Date().toISOString(),
      servings: 4,
      yieldIngredientId: yields ? yieldVariantId : null,
      yieldVariantId: yields ? yieldVariantId : null,
      yieldQty: yields ? 800 : null,
      yieldUnit: yields ? 'g' : null,
    })
    .where(eq(recipeVersions.id, version.id))
    .run();
  // Insert one canonical-g line so consumeForRun has work to do.
  db.insert(recipeLines)
    .values({
      recipeVersionId: version.id,
      position: 1,
      ingredientId: ing.id,
      variantId: variant.id,
      prepStateId: null,
      isRecipeRef: 0,
      recipeRefId: null,
      originalText: 'tomato',
      originalQty: 200,
      originalUnit: 'g',
      qtyG: 200,
      qtyMl: null,
      qtyCount: null,
      canonicalUnit: 'g',
      optional: 0,
      notes: null,
    })
    .run();
  return {
    recipeId: version.recipeId,
    versionId: version.id,
    ingredientId: ing.id,
    variantId: variant.id,
    yieldVariantId,
  };
}

function seedBatch(variantId: number, qty: number): number {
  const db = getDrizzle();
  const rows = db
    .insert(batches)
    .values({
      variantId,
      prepStateId: null,
      qtyRemaining: qty,
      unit: 'g',
      sourceType: 'purchase',
      sourceId: null,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: null,
      notes: null,
    })
    .returning()
    .all();
  const row = rows[0];
  if (row === undefined) throw new Error('seedBatch failed');
  return row.id;
}

describe('food.cook router — PRD-144', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    caller = createCaller();
    // Seed default plan slot so FK from plan_entries.slot resolves.
    getDrizzle()
      .insert(planSlots)
      .values({ slug: 'dinner', name: 'Dinner', displayOrder: 30, isDefault: 1 })
      .run();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  describe('prepareCook', () => {
    it('returns CookPreparation for a yielding recipe', async () => {
      const seed = seedCompiledRecipe('prep-happy');
      const result = await caller.food.cook.prepareCook({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
      });
      expect(result.recipeSlug).toBe('prep-happy');
      expect(result.yieldsBatch).toBe(true);
      expect(result.yieldDefault?.qty).toBe(800);
      expect(result.consumeNeeds).toHaveLength(1);
      expect(result.consumeNeeds[0]).toMatchObject({
        variantId: seed.variantId,
        qty: 200,
        canonicalUnit: 'g',
      });
      expect(result.alreadyCooked).toBe(false);
    });

    it('uses the plan entry servings ratio for defaultScaleFactor', async () => {
      const seed = seedCompiledRecipe('prep-plan-scale');
      const db = getDrizzle();
      db.insert(planEntries)
        .values({
          date: '2026-06-15',
          slot: 'dinner',
          recipeId: seed.recipeId,
          recipeVersionId: seed.versionId,
          plannedServings: 8,
        })
        .run();
      // Manually seed plan_slots since we don't run the seed step.
      // Workaround: use the FK-relaxed default slot if seed-data isn't loaded.
      const planRows = db.select().from(planEntries).all();
      const planEntryId = planRows[0]?.id ?? 0;
      const result = await caller.food.cook.prepareCook({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        planEntryId,
      });
      // 8 planned / 4 servings = 2x scale
      expect(result.defaultScaleFactor).toBeCloseTo(2);
      expect(result.alreadyCooked).toBe(false);
    });

    it('throws NOT_FOUND on missing recipe version', async () => {
      await expect(
        caller.food.cook.prepareCook({ recipeVersionId: 99999, scaleFactor: 1 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('markCooked happy path', () => {
    it('writes recipe_run + consumption + yielded batch + auto-expiry in one tx', async () => {
      const seed = seedCompiledRecipe('cook-happy');
      const batchId = seedBatch(seed.variantId, 1000);
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
        rating: 4,
        notes: 'tasty',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.yieldedBatchId).not.toBeNull();
        const db = getDrizzle();
        const run = db
          .select()
          .from(recipeRuns)
          .where(eq(recipeRuns.id, result.recipeRunId))
          .all()[0];
        expect(run?.rating).toBe(4);
        expect(run?.notes).toBe('tasty');
        expect(run?.completedAt).not.toBeNull();
        expect(run?.yieldedBatchId).toBe(result.yieldedBatchId);
        const source = db.select().from(batches).where(eq(batches.id, batchId)).all()[0];
        expect(source?.qtyRemaining).toBe(800);
        const consumptions = db
          .select()
          .from(batchConsumptions)
          .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
          .all();
        expect(consumptions).toHaveLength(1);
        expect(consumptions[0]?.qtyConsumed).toBe(200);
        const yielded = db
          .select()
          .from(batches)
          .where(eq(batches.id, result.yieldedBatchId ?? -1))
          .all()[0];
        expect(yielded?.expiresAt).not.toBeNull();
      }
    });

    it('runs yieldless recipes with yieldedBatchId === null', async () => {
      const seed = seedCompiledRecipe('cook-yieldless', { yields: false });
      seedBatch(seed.variantId, 500);
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.yieldedBatchId).toBeNull();
      }
    });

    it('scales consumption with scaleFactor', async () => {
      const seed = seedCompiledRecipe('cook-scaled');
      const batchId = seedBatch(seed.variantId, 1000);
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1.5,
        yield: { qty: 1200, unit: 'g', location: 'fridge' },
      });
      expect(result.ok).toBe(true);
      const db = getDrizzle();
      const source = db.select().from(batches).where(eq(batches.id, batchId)).all()[0];
      expect(source?.qtyRemaining).toBe(700); // 1000 - 200*1.5 = 700
    });
  });

  describe('markCooked error branches', () => {
    it('rejects RecipeVersionNotFound', async () => {
      const result = await caller.food.cook.markCooked({
        recipeVersionId: 99999,
        scaleFactor: 1,
      });
      expect(result).toEqual({ ok: false, reason: 'RecipeVersionNotFound' });
    });

    it('rejects RecipeNotCompiled', async () => {
      const seed = seedCompiledRecipe('cook-uncompiled');
      const db = getDrizzle();
      db.update(recipeVersions)
        .set({ compileStatus: 'uncompiled' })
        .where(eq(recipeVersions.id, seed.versionId))
        .run();
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      expect(result).toEqual({ ok: false, reason: 'RecipeNotCompiled' });
    });

    it('rejects BadScaleFactor for scale <= 0', async () => {
      const seed = seedCompiledRecipe('cook-bad-scale');
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 0,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      expect(result).toEqual({ ok: false, reason: 'BadScaleFactor' });
    });

    it('rejects YieldRequired when yield omitted for yielding recipe', async () => {
      const seed = seedCompiledRecipe('cook-yield-required');
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
      });
      expect(result).toEqual({ ok: false, reason: 'YieldRequired' });
    });

    it('rejects YieldForbidden when yield supplied for yieldless recipe', async () => {
      const seed = seedCompiledRecipe('cook-yield-forbidden', { yields: false });
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      expect(result).toEqual({ ok: false, reason: 'YieldForbidden' });
    });

    it('rejects BadYieldQty for negative yield', async () => {
      const seed = seedCompiledRecipe('cook-bad-yield');
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: -1, unit: 'g', location: 'fridge' },
      });
      expect(result).toEqual({ ok: false, reason: 'BadYieldQty' });
    });

    it('rejects BadRating for rating > 5', async () => {
      const seed = seedCompiledRecipe('cook-bad-rating');
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        rating: 6,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      expect(result).toEqual({ ok: false, reason: 'BadRating' });
    });

    it('rejects ShortfallUnresolved and rolls back the recipe_run', async () => {
      const seed = seedCompiledRecipe('cook-shortfall');
      // No batch seeded — consume needs 200g, FIFO finds zero.
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('ShortfallUnresolved');
        expect(result.shortfalls?.[0]).toMatchObject({ needed: 200, available: 0 });
      }
      const db = getDrizzle();
      const runs = db.select().from(recipeRuns).all();
      expect(runs).toHaveLength(0);
    });
  });

  describe('plan entry integration', () => {
    it('links recipe_run_id back to plan_entries on success', async () => {
      const seed = seedCompiledRecipe('cook-plan-link');
      seedBatch(seed.variantId, 500);
      const db = getDrizzle();
      db.insert(planEntries)
        .values({
          date: '2026-06-15',
          slot: 'dinner',
          recipeId: seed.recipeId,
          plannedServings: 4,
        })
        .run();
      const planEntryId = db.select().from(planEntries).all()[0]?.id;
      if (planEntryId === undefined) throw new Error('plan entry missing');

      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        planEntryId,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      expect(result.ok).toBe(true);
      const updated = db.select().from(planEntries).where(eq(planEntries.id, planEntryId)).all()[0];
      if (result.ok) {
        expect(updated?.recipeRunId).toBe(result.recipeRunId);
      }
    });

    it('rejects PlanEntryAlreadyCooked when recipe_run_id is set', async () => {
      const seed = seedCompiledRecipe('cook-already-cooked');
      seedBatch(seed.variantId, 1000);
      const db = getDrizzle();
      db.insert(planEntries)
        .values({
          date: '2026-06-15',
          slot: 'dinner',
          recipeId: seed.recipeId,
          plannedServings: 4,
        })
        .run();
      const planEntryId = db.select().from(planEntries).all()[0]?.id;
      if (planEntryId === undefined) throw new Error('plan entry missing');
      // First cook — success.
      await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        planEntryId,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      const second = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        planEntryId,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      expect(second).toEqual({ ok: false, reason: 'PlanEntryAlreadyCooked' });
    });

    it('rejects PlanEntryNotFound for a stale id', async () => {
      const seed = seedCompiledRecipe('cook-plan-stale');
      seedBatch(seed.variantId, 500);
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        planEntryId: 99999,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
      });
      expect(result).toEqual({ ok: false, reason: 'PlanEntryNotFound' });
    });
  });

  describe('consumption overrides (PRD-146 deferred slice)', () => {
    it('applies batch-override and skips FIFO for the same line', async () => {
      const seed = seedCompiledRecipe('cook-override');
      const fifoBatchId = seedBatch(seed.variantId, 1000);
      const overrideBatchId = seedBatch(seed.variantId, 500);
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
        consumptionOverrides: [
          {
            lineIndex: 1,
            kind: 'batch-override',
            batchId: overrideBatchId,
            consumeQty: 200,
            unit: 'g',
          },
        ],
      });
      expect(result.ok).toBe(true);
      const db = getDrizzle();
      const fifo = db.select().from(batches).where(eq(batches.id, fifoBatchId)).all()[0];
      const overridden = db.select().from(batches).where(eq(batches.id, overrideBatchId)).all()[0];
      expect(fifo?.qtyRemaining).toBe(1000); // untouched
      expect(overridden?.qtyRemaining).toBe(300); // 500 - 200
    });

    it('records external overrides in recipe_runs.notes', async () => {
      const seed = seedCompiledRecipe('cook-external');
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
        consumptionOverrides: [
          {
            lineIndex: 1,
            kind: 'external',
            externalQty: 200,
            externalUnit: 'g',
          },
        ],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const db = getDrizzle();
        const run = db
          .select()
          .from(recipeRuns)
          .where(eq(recipeRuns.id, result.recipeRunId))
          .all()[0];
        expect(run?.notes).toContain('cook-override:external');
      }
    });

    it('rejects a zero-qty batch-override so it cannot bypass FIFO', async () => {
      const seed = seedCompiledRecipe('cook-zero-qty');
      seedBatch(seed.variantId, 1000);
      const overrideBatchId = seedBatch(seed.variantId, 500);
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
        consumptionOverrides: [
          {
            lineIndex: 1,
            kind: 'batch-override',
            batchId: overrideBatchId,
            consumeQty: 0,
            unit: 'g',
          },
        ],
      });
      expect(result).toMatchObject({ ok: false, reason: 'ShortfallUnresolved' });
    });

    it('rejects a batch-override pointing at a different variant', async () => {
      const seed = seedCompiledRecipe('cook-wrong-variant');
      seedBatch(seed.variantId, 1000);
      // Seed a batch on the yield variant (unrelated to the recipe line).
      const wrongBatchId = seedBatch(seed.yieldVariantId, 500);
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: { qty: 800, unit: 'g', location: 'fridge' },
        consumptionOverrides: [
          {
            lineIndex: 1,
            kind: 'batch-override',
            batchId: wrongBatchId,
            consumeQty: 200,
            unit: 'g',
          },
        ],
      });
      expect(result).toMatchObject({ ok: false, reason: 'ShortfallUnresolved' });
    });
  });

  describe('expiry validation', () => {
    it('rejects BadExpiry for past expiresAt', async () => {
      const seed = seedCompiledRecipe('cook-bad-expiry');
      seedBatch(seed.variantId, 500);
      const result = await caller.food.cook.markCooked({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        yield: {
          qty: 800,
          unit: 'g',
          location: 'fridge',
          expiresAt: '2025-01-01T00:00:00.000Z',
        },
      });
      expect(result).toEqual({ ok: false, reason: 'BadExpiry' });
    });
  });
});
