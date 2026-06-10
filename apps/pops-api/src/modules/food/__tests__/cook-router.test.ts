/**
 * PRD-144 — integration tests for `food.cook.*`.
 *
 * Covers the cook event happy path, every `MarkCookedError` branch, the
 * shortfall-rollback contract, and plan-entry linkage + race.
 *
 * Consumption-override behaviour (PRD-146's deferred slice) is exercised
 * separately in `cook-overrides.test.ts`.
 */
import { type Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  batchConsumptions,
  batches,
  planEntries,
  planSlots,
  recipeRuns,
  recipeVersions,
} from '@pops/app-food-db';

import { closeDb, getDrizzle, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';
import { createFoodTestDb, seedBatch, seedCompiledRecipe } from './cook-test-helpers.js';

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
