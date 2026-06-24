/**
 * Integration tests for the `cook.*` REST surface.
 *
 * `prepareCook` happy path + 404; `markCooked` happy path, scale, yieldless,
 * every `MarkCookedError` branch, plan-entry linkage + race, plus the
 * consumption-override matrix (batch-override / external / partial,
 * optional-line skip, coverage/variant/unit guards) and the substitution
 * edge path. The consumption maths live in the db tests; here we assert the
 * wire envelopes + the transactional side effects via direct table reads.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  batchConsumptions,
  batches,
  type FoodDb,
  type OpenedFoodDb,
  openFoodDb,
  planEntries,
  planSlots,
  recipeLines,
  recipeRuns,
  recipeVersions,
} from '../../db/index.js';
import { createIngredient } from '../../db/services/ingredients.js';
import { createRecipe } from '../../db/services/recipes.js';
import { createSubstitution } from '../../db/services/substitutions.js';
import { createVariant } from '../../db/services/variants.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;

function db(): FoodDb {
  return foodDb.db;
}

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

interface SeededRecipe {
  recipeId: number;
  versionId: number;
  ingredientId: number;
  variantId: number;
  yieldIngredientId: number;
  yieldVariantId: number;
}

function seedTomatoVariant(slug: string): { ingredientId: number; variantId: number } {
  const ing = createIngredient(db(), { name: 'Tomato', slug: `${slug}-tomato`, defaultUnit: 'g' });
  const variant = createVariant(db(), {
    ingredientId: ing.id,
    name: 'Diced',
    slug: `${slug}-diced`,
    defaultUnit: 'g',
    defaultShelfLifeDaysFridge: 5,
    defaultShelfLifeDaysFreezer: 90,
  });
  return { ingredientId: ing.id, variantId: variant.id };
}

function seedYieldVariant(slug: string): { ingredientId: number; variantId: number } {
  const yieldIng = createIngredient(db(), {
    name: 'Sauce',
    slug: `${slug}-sauce`,
    defaultUnit: 'g',
  });
  const yieldVar = createVariant(db(), {
    ingredientId: yieldIng.id,
    name: 'Default',
    slug: `${slug}-sauce-default`,
    defaultUnit: 'g',
    defaultShelfLifeDaysFridge: 3,
    defaultShelfLifeDaysFreezer: 60,
  });
  return { ingredientId: yieldIng.id, variantId: yieldVar.id };
}

function finaliseRecipeVersion(
  versionId: number,
  yieldShape: { ingredientId: number; variantId: number } | null
): void {
  const yields = yieldShape !== null;
  db()
    .update(recipeVersions)
    .set({
      compileStatus: 'compiled',
      compiledAt: new Date().toISOString(),
      servings: 4,
      yieldIngredientId: yields ? yieldShape.ingredientId : null,
      yieldVariantId: yields ? yieldShape.variantId : null,
      yieldQty: yields ? 800 : null,
      yieldUnit: yields ? 'g' : null,
    })
    .where(eq(recipeVersions.id, versionId))
    .run();
}

interface RecipeLineArgs {
  versionId: number;
  position: number;
  ingredientId: number;
  variantId: number;
  qtyG: number;
  optional?: boolean;
}

function seedRecipeLine(args: RecipeLineArgs): void {
  db()
    .insert(recipeLines)
    .values({
      recipeVersionId: args.versionId,
      position: args.position,
      ingredientId: args.ingredientId,
      variantId: args.variantId,
      prepStateId: null,
      isRecipeRef: 0,
      recipeRefId: null,
      originalText: `line-${args.position}`,
      originalQty: args.qtyG,
      originalUnit: 'g',
      qtyG: args.qtyG,
      qtyMl: null,
      qtyCount: null,
      canonicalUnit: 'g',
      optional: args.optional === true ? 1 : 0,
      notes: null,
    })
    .run();
}

function seedCompiledRecipe(slug: string, opts: { yields?: boolean } = {}): SeededRecipe {
  const yields = opts.yields ?? true;
  const tomato = seedTomatoVariant(slug);
  const yieldShape = yields ? seedYieldVariant(slug) : tomato;
  const { recipe, version } = createRecipe(db(), {
    slug,
    firstVersion: { title: `Test ${slug}`, bodyDsl: `@recipe(slug="${slug}", title="Test")` },
  });
  finaliseRecipeVersion(version.id, yields ? yieldShape : null);
  seedRecipeLine({
    versionId: version.id,
    position: 1,
    variantId: tomato.variantId,
    ingredientId: tomato.ingredientId,
    qtyG: 200,
  });
  return {
    recipeId: recipe.id,
    versionId: version.id,
    ingredientId: tomato.ingredientId,
    variantId: tomato.variantId,
    yieldIngredientId: yieldShape.ingredientId,
    yieldVariantId: yieldShape.variantId,
  };
}

function seedBatch(variantId: number, qty: number): number {
  const rows = db()
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

function seedExtraIngredientLine(args: {
  slug: string;
  versionId: number;
  position: number;
  qtyG: number;
  optional?: boolean;
}): number {
  const ing = createIngredient(db(), {
    name: `Extra ${args.slug}`,
    slug: `${args.slug}-extra-${args.position}`,
    defaultUnit: 'g',
  });
  const variant = createVariant(db(), {
    ingredientId: ing.id,
    name: 'Default',
    slug: `${args.slug}-extra-${args.position}-default`,
    defaultUnit: 'g',
  });
  seedRecipeLine({
    versionId: args.versionId,
    position: args.position,
    ingredientId: ing.id,
    variantId: variant.id,
    qtyG: args.qtyG,
    optional: args.optional,
  });
  return variant.id;
}

function seedDinnerSlot(): void {
  db()
    .insert(planSlots)
    .values({ slug: 'dinner', name: 'Dinner', displayOrder: 30, isDefault: 1 })
    .run();
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-cook-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  seedDinnerSlot();
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('cook REST — prepareCook', () => {
  it('returns CookPreparation for a yielding recipe', async () => {
    const seed = seedCompiledRecipe('prep-happy');
    const result = await client().cook.prepareCook({
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
    db()
      .insert(planEntries)
      .values({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: seed.recipeId,
        recipeVersionId: seed.versionId,
        plannedServings: 8,
      })
      .run();
    const planEntryId = db().select().from(planEntries).all()[0]?.id;
    if (planEntryId === undefined) throw new Error('plan entry missing');
    const result = await client().cook.prepareCook({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      planEntryId,
    });
    expect(result.defaultScaleFactor).toBeCloseTo(2);
    expect(result.alreadyCooked).toBe(false);
  });

  it('maps a missing recipe version to 404', async () => {
    await expect(
      client().cook.prepareCook({ recipeVersionId: 99999, scaleFactor: 1 })
    ).rejects.toMatchObject({ status: 404, body: { message: 'RecipeVersionNotFound' } });
  });

  it('maps a missing plan entry to 404', async () => {
    const seed = seedCompiledRecipe('prep-plan-missing');
    await expect(
      client().cook.prepareCook({
        recipeVersionId: seed.versionId,
        scaleFactor: 1,
        planEntryId: 99999,
      })
    ).rejects.toMatchObject({ status: 404, body: { message: 'PlanEntryNotFound' } });
  });
});

describe('cook REST — markCooked happy path', () => {
  it('writes recipe_run + consumption + yielded batch + auto-expiry in one tx', async () => {
    const seed = seedCompiledRecipe('cook-happy');
    const batchId = seedBatch(seed.variantId, 1000);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      rating: 4,
      notes: 'tasty',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yieldedBatchId).not.toBeNull();
    const run = db()
      .select()
      .from(recipeRuns)
      .where(eq(recipeRuns.id, result.recipeRunId))
      .all()[0];
    expect(run?.rating).toBe(4);
    expect(run?.notes).toBe('tasty');
    expect(run?.completedAt).not.toBeNull();
    expect(run?.yieldedBatchId).toBe(result.yieldedBatchId);
    const source = db().select().from(batches).where(eq(batches.id, batchId)).all()[0];
    expect(source?.qtyRemaining).toBe(800);
    const consumptions = db()
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toHaveLength(1);
    expect(consumptions[0]?.qtyConsumed).toBe(200);
    const yielded = db()
      .select()
      .from(batches)
      .where(eq(batches.id, result.yieldedBatchId ?? -1))
      .all()[0];
    expect(yielded?.expiresAt).not.toBeNull();
  });

  it('runs yieldless recipes with yieldedBatchId === null', async () => {
    const seed = seedCompiledRecipe('cook-yieldless', { yields: false });
    seedBatch(seed.variantId, 500);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.yieldedBatchId).toBeNull();
  });

  it('scales consumption with scaleFactor', async () => {
    const seed = seedCompiledRecipe('cook-scaled');
    const batchId = seedBatch(seed.variantId, 1000);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1.5,
      yield: { qty: 1200, unit: 'g', location: 'fridge' },
    });
    expect(result.ok).toBe(true);
    const source = db().select().from(batches).where(eq(batches.id, batchId)).all()[0];
    expect(source?.qtyRemaining).toBe(700);
  });
});

describe('cook REST — markCooked error branches', () => {
  it('rejects RecipeVersionNotFound', async () => {
    const result = await client().cook.markCooked({ recipeVersionId: 99999, scaleFactor: 1 });
    expect(result).toEqual({ ok: false, reason: 'RecipeVersionNotFound' });
  });

  it('rejects RecipeNotCompiled', async () => {
    const seed = seedCompiledRecipe('cook-uncompiled');
    db()
      .update(recipeVersions)
      .set({ compileStatus: 'uncompiled' })
      .where(eq(recipeVersions.id, seed.versionId))
      .run();
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
    });
    expect(result).toEqual({ ok: false, reason: 'RecipeNotCompiled' });
  });

  it('rejects BadScaleFactor for scale <= 0', async () => {
    const seed = seedCompiledRecipe('cook-bad-scale');
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 0,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
    });
    expect(result).toEqual({ ok: false, reason: 'BadScaleFactor' });
  });

  it('rejects YieldRequired when yield omitted for yielding recipe', async () => {
    const seed = seedCompiledRecipe('cook-yield-required');
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
    });
    expect(result).toEqual({ ok: false, reason: 'YieldRequired' });
  });

  it('rejects YieldForbidden when yield supplied for yieldless recipe', async () => {
    const seed = seedCompiledRecipe('cook-yield-forbidden', { yields: false });
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
    });
    expect(result).toEqual({ ok: false, reason: 'YieldForbidden' });
  });

  it('rejects BadYieldQty for negative yield', async () => {
    const seed = seedCompiledRecipe('cook-bad-yield');
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: -1, unit: 'g', location: 'fridge' },
    });
    expect(result).toEqual({ ok: false, reason: 'BadYieldQty' });
  });

  it('rejects BadRating for rating > 5', async () => {
    const seed = seedCompiledRecipe('cook-bad-rating');
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      rating: 6,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
    });
    expect(result).toEqual({ ok: false, reason: 'BadRating' });
  });

  it('rejects BadExpiry for a past expiresAt', async () => {
    const seed = seedCompiledRecipe('cook-bad-expiry');
    seedBatch(seed.variantId, 500);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge', expiresAt: '2025-01-01T00:00:00.000Z' },
    });
    expect(result).toEqual({ ok: false, reason: 'BadExpiry' });
  });

  it('rejects ShortfallUnresolved and rolls back the recipe_run', async () => {
    const seed = seedCompiledRecipe('cook-shortfall');
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('ShortfallUnresolved');
      expect(result.shortfalls?.[0]).toMatchObject({ needed: 200, available: 0 });
    }
    expect(db().select().from(recipeRuns).all()).toHaveLength(0);
  });
});

describe('cook REST — plan entry integration', () => {
  it('links recipe_run_id back to plan_entries on success', async () => {
    const seed = seedCompiledRecipe('cook-plan-link');
    seedBatch(seed.variantId, 500);
    db()
      .insert(planEntries)
      .values({ date: '2026-06-15', slot: 'dinner', recipeId: seed.recipeId, plannedServings: 4 })
      .run();
    const planEntryId = db().select().from(planEntries).all()[0]?.id;
    if (planEntryId === undefined) throw new Error('plan entry missing');
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      planEntryId,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
    });
    expect(result.ok).toBe(true);
    const updated = db().select().from(planEntries).where(eq(planEntries.id, planEntryId)).all()[0];
    if (result.ok) expect(updated?.recipeRunId).toBe(result.recipeRunId);
  });

  it('rejects PlanEntryAlreadyCooked when recipe_run_id is set', async () => {
    const seed = seedCompiledRecipe('cook-already-cooked');
    seedBatch(seed.variantId, 1000);
    db()
      .insert(planEntries)
      .values({ date: '2026-06-15', slot: 'dinner', recipeId: seed.recipeId, plannedServings: 4 })
      .run();
    const planEntryId = db().select().from(planEntries).all()[0]?.id;
    if (planEntryId === undefined) throw new Error('plan entry missing');
    const api = client();
    await api.cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      planEntryId,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
    });
    const second = await api.cook.markCooked({
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
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      planEntryId: 99999,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
    });
    expect(result).toEqual({ ok: false, reason: 'PlanEntryNotFound' });
  });
});

describe('cook REST — consumption overrides', () => {
  it("kind='batch-override' draws from the chosen batch, leaving FIFO untouched", async () => {
    const seed = seedCompiledRecipe('override-batch');
    const fifoBatchId = seedBatch(seed.variantId, 1000);
    const chosenBatchId = seedBatch(seed.variantId, 500);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: chosenBatchId,
          consumeQty: 200,
          unit: 'g',
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const consumptions = db()
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toHaveLength(1);
    expect(consumptions[0]).toMatchObject({ batchId: chosenBatchId, qtyConsumed: 200, unit: 'g' });
    expect(
      db().select().from(batches).where(eq(batches.id, chosenBatchId)).all()[0]?.qtyRemaining
    ).toBe(300);
    expect(
      db().select().from(batches).where(eq(batches.id, fifoBatchId)).all()[0]?.qtyRemaining
    ).toBe(1000);
  });

  it("kind='external' writes no consumption row and appends an audit line", async () => {
    const seed = seedCompiledRecipe('override-external');
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      notes: 'tasted great',
      consumptionOverrides: [
        { lineIndex: 1, kind: 'external', externalQty: 200, externalUnit: 'g' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const consumptions = db()
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toEqual([]);
    const run = db()
      .select()
      .from(recipeRuns)
      .where(eq(recipeRuns.id, result.recipeRunId))
      .all()[0];
    expect(run?.notes).toBe('tasted great\ncook-override:external line=1 qty=200 unit=g');
  });

  it("kind='partial' draws a batch row and appends the external audit line", async () => {
    const seed = seedCompiledRecipe('override-partial');
    const chosenBatchId = seedBatch(seed.variantId, 150);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'partial',
          batchId: chosenBatchId,
          consumeQty: 150,
          externalQty: 50,
          unit: 'g',
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const consumptions = db()
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toHaveLength(1);
    expect(consumptions[0]).toMatchObject({ batchId: chosenBatchId, qtyConsumed: 150, unit: 'g' });
    expect(
      db().select().from(batches).where(eq(batches.id, chosenBatchId)).all()[0]?.qtyRemaining
    ).toBe(0);
    const run = db()
      .select()
      .from(recipeRuns)
      .where(eq(recipeRuns.id, result.recipeRunId))
      .all()[0];
    expect(run?.notes).toBe('cook-override:external line=1 qty=50 unit=g');
  });

  it('silently skips an override targeting an optional line', async () => {
    const seed = seedCompiledRecipe('override-optional');
    seedBatch(seed.variantId, 1000);
    const optionalVariantId = seedExtraIngredientLine({
      slug: 'override-optional',
      versionId: seed.versionId,
      position: 2,
      qtyG: 100,
      optional: true,
    });
    const optionalBatchId = seedBatch(optionalVariantId, 100);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      consumptionOverrides: [
        {
          lineIndex: 2,
          kind: 'batch-override',
          batchId: optionalBatchId,
          consumeQty: 100,
          unit: 'g',
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const optionalDraws = db()
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all()
      .filter((c) => c.batchId === optionalBatchId);
    expect(optionalDraws).toEqual([]);
    expect(
      db().select().from(batches).where(eq(batches.id, optionalBatchId)).all()[0]?.qtyRemaining
    ).toBe(100);
  });

  it('returns ShortfallUnresolved when the chosen batch lacks the qty, rolling back', async () => {
    const seed = seedCompiledRecipe('override-depleted');
    const depletedBatchId = seedBatch(seed.variantId, 50);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: depletedBatchId,
          consumeQty: 200,
          unit: 'g',
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'ShortfallUnresolved' });
    expect(
      db().select().from(batches).where(eq(batches.id, depletedBatchId)).all()[0]?.qtyRemaining
    ).toBe(50);
    expect(db().select().from(batchConsumptions).all()).toEqual([]);
  });

  it('rejects a zero-qty batch-override so it cannot mask the line from FIFO', async () => {
    const seed = seedCompiledRecipe('override-zero-qty');
    seedBatch(seed.variantId, 1000);
    const overrideBatchId = seedBatch(seed.variantId, 500);
    const result = await client().cook.markCooked({
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
    const seed = seedCompiledRecipe('override-wrong-variant');
    seedBatch(seed.variantId, 1000);
    const wrongBatchId = seedBatch(seed.yieldVariantId, 500);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      consumptionOverrides: [
        { lineIndex: 1, kind: 'batch-override', batchId: wrongBatchId, consumeQty: 200, unit: 'g' },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'ShortfallUnresolved' });
  });

  it('rejects an override whose qty does not cover the full scaled line need', async () => {
    const seed = seedCompiledRecipe('override-qty-mismatch');
    seedBatch(seed.variantId, 1000);
    const overrideBatchId = seedBatch(seed.variantId, 1000);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1.5,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: overrideBatchId,
          consumeQty: 100,
          unit: 'g',
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'ShortfallUnresolved' });
    expect(
      db().select().from(batches).where(eq(batches.id, overrideBatchId)).all()[0]?.qtyRemaining
    ).toBe(1000);
    expect(db().select().from(batchConsumptions).all()).toEqual([]);
  });

  it('rejects an external override whose unit does not match the line', async () => {
    const seed = seedCompiledRecipe('override-unit-mismatch');
    seedBatch(seed.variantId, 1000);
    const result = await client().cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      consumptionOverrides: [
        { lineIndex: 1, kind: 'external', externalQty: 200, externalUnit: 'ml' },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'ShortfallUnresolved' });
  });
});

describe('cook REST — substitution overrides', () => {
  function makeVariant(
    slug: string,
    variantSlug: string
  ): { ingredientId: number; variantId: number } {
    const ing = createIngredient(db(), { name: slug, slug, defaultUnit: 'g' });
    const variant = createVariant(db(), {
      ingredientId: ing.id,
      name: variantSlug,
      slug: variantSlug,
      defaultUnit: 'g',
    });
    return { ingredientId: ing.id, variantId: variant.id };
  }

  function makeYieldlessRecipe(slug: string): { recipeId: number; versionId: number } {
    const { recipe, version } = createRecipe(db(), {
      slug,
      firstVersion: { title: slug, bodyDsl: `@recipe(slug="${slug}", title="${slug}")` },
    });
    db()
      .update(recipeVersions)
      .set({ compileStatus: 'compiled', servings: 4 })
      .where(eq(recipeVersions.id, version.id))
      .run();
    return { recipeId: recipe.id, versionId: version.id };
  }

  it('draws from the sub batch and writes the substitution audit line', async () => {
    const butter = makeVariant('butter', 'unsalted');
    const oil = makeVariant('coconut-oil', 'refined');
    const recipe = makeYieldlessRecipe('cookies');
    seedRecipeLine({
      versionId: recipe.versionId,
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
    });
    const oilBatchId = seedBatch(oil.variantId, 500);
    const edge = createSubstitution(db(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
    });
    const result = await client().cook.markCooked({
      recipeVersionId: recipe.versionId,
      scaleFactor: 1,
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: oilBatchId,
          consumeQty: 200,
          unit: 'g',
          substitutionEdgeId: edge.id,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const consumptions = db()
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toHaveLength(1);
    expect(consumptions[0]?.batchId).toBe(oilBatchId);
    expect(
      db().select().from(batches).where(eq(batches.id, oilBatchId)).all()[0]?.qtyRemaining
    ).toBe(300);
    const run = db()
      .select()
      .from(recipeRuns)
      .where(eq(recipeRuns.id, result.recipeRunId))
      .all()[0];
    expect(run?.notes ?? '').toContain('cook-override:substitution');
    expect(run?.notes ?? '').toContain(`edge=${edge.id}`);
    expect(run?.notes ?? '').toContain(`batch=${oilBatchId}`);
    expect(run?.notes ?? '').toContain('coconut-oil');
  });

  it('returns SubstitutionEdgeInvalid for an unknown edge id', async () => {
    const butter = makeVariant('butter', 'unsalted');
    const oil = makeVariant('coconut-oil', 'refined');
    const recipe = makeYieldlessRecipe('cookies');
    seedRecipeLine({
      versionId: recipe.versionId,
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
    });
    const oilBatchId = seedBatch(oil.variantId, 500);
    const result = await client().cook.markCooked({
      recipeVersionId: recipe.versionId,
      scaleFactor: 1,
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: oilBatchId,
          consumeQty: 200,
          unit: 'g',
          substitutionEdgeId: 99999,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SubstitutionEdgeInvalid');
  });

  it('returns SubstitutionEdgeInvalid when the batch variant misses the edge to-side', async () => {
    const butter = makeVariant('butter', 'unsalted');
    const oil = makeVariant('coconut-oil', 'refined');
    const ghee = makeVariant('ghee', 'clarified');
    const recipe = makeYieldlessRecipe('cookies');
    seedRecipeLine({
      versionId: recipe.versionId,
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
    });
    const gheeBatchId = seedBatch(ghee.variantId, 500);
    const edge = createSubstitution(db(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
    });
    const result = await client().cook.markCooked({
      recipeVersionId: recipe.versionId,
      scaleFactor: 1,
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: gheeBatchId,
          consumeQty: 200,
          unit: 'g',
          substitutionEdgeId: edge.id,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SubstitutionEdgeInvalid');
  });
});
