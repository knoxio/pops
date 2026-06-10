/**
 * PRD-146 deferred slice — consumption-override behaviour inside
 * `food.cook.markCooked`.
 *
 * Mirrors the spec in [PRD-146 §"Integration with PRD-144's cook
 * mutation"](docs/themes/07-food/prds/146-fifo-consumption-ui/README.md):
 * the happy-path persistence contract (one test per row of the override
 * matrix: `batch-override`, `external`, `partial`, optional-line silent
 * skip, depleted-batch shortfall) plus the reject guards that stop
 * overrides from bypassing FIFO (zero-qty, wrong variant, qty mismatch
 * vs the scaled line need).
 */
import { type Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { batchConsumptions, batches, planSlots, recipeRuns } from '@pops/app-food-db';

import { closeDb, getDrizzle, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';
import {
  createFoodTestDb,
  seedBatch,
  seedCompiledRecipe,
  seedExtraIngredientLine,
} from './cook-test-helpers.js';

describe('food.cook.markCooked — PRD-146 consumption overrides', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    caller = createCaller();
    getDrizzle()
      .insert(planSlots)
      .values({ slug: 'dinner', name: 'Dinner', displayOrder: 30, isDefault: 1 })
      .run();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  it("kind='batch-override' writes a batch_consumptions row against the chosen batch", async () => {
    const seed = seedCompiledRecipe('override-batch');
    const fifoBatchId = seedBatch(seed.variantId, 1000);
    const chosenBatchId = seedBatch(seed.variantId, 500);
    const result = await caller.food.cook.markCooked({
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

    const db = getDrizzle();
    const consumptions = db
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toHaveLength(1);
    expect(consumptions[0]).toMatchObject({
      batchId: chosenBatchId,
      qtyConsumed: 200,
      unit: 'g',
    });

    const chosen = db.select().from(batches).where(eq(batches.id, chosenBatchId)).all()[0];
    const fifo = db.select().from(batches).where(eq(batches.id, fifoBatchId)).all()[0];
    expect(chosen?.qtyRemaining).toBe(300);
    expect(fifo?.qtyRemaining).toBe(1000);
  });

  it("kind='external' writes no batch_consumptions row and appends an audit line to recipe_runs.notes", async () => {
    const seed = seedCompiledRecipe('override-external');
    // The required line is fully covered by the external override; no
    // FIFO batch is needed (and seeding one would let FIFO pick it up).
    const result = await caller.food.cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      notes: 'tasted great',
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
    if (!result.ok) return;

    const db = getDrizzle();
    const consumptions = db
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toEqual([]);

    const run = db.select().from(recipeRuns).where(eq(recipeRuns.id, result.recipeRunId)).all()[0];
    expect(run?.notes).toBe('tasted great\ncook-override:external line=1 qty=200 unit=g');
  });

  it("kind='partial' writes one batch_consumptions row and appends an audit line", async () => {
    const seed = seedCompiledRecipe('override-partial');
    const chosenBatchId = seedBatch(seed.variantId, 150);
    const result = await caller.food.cook.markCooked({
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

    const db = getDrizzle();
    const consumptions = db
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toHaveLength(1);
    expect(consumptions[0]).toMatchObject({
      batchId: chosenBatchId,
      qtyConsumed: 150,
      unit: 'g',
    });

    const chosen = db.select().from(batches).where(eq(batches.id, chosenBatchId)).all()[0];
    expect(chosen?.qtyRemaining).toBe(0);

    const run = db.select().from(recipeRuns).where(eq(recipeRuns.id, result.recipeRunId)).all()[0];
    expect(run?.notes).toBe('cook-override:external line=1 qty=50 unit=g');
  });

  it('silently skips overrides that target an optional line (PRD-108 contract)', async () => {
    const seed = seedCompiledRecipe('override-optional');
    // Required line 1 — its FIFO need is covered by the tomato batch.
    seedBatch(seed.variantId, 1000);
    // Optional line 2 on its own variant. The user fills out an override
    // for it; the cook server should drop it silently per the spec.
    const optionalVariantId = seedExtraIngredientLine({
      slug: 'override-optional',
      versionId: seed.versionId,
      position: 2,
      qtyG: 100,
      optional: true,
    });
    const optionalBatchId = seedBatch(optionalVariantId, 100);

    const result = await caller.food.cook.markCooked({
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

    const db = getDrizzle();
    const consumptions = db
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    // The only batch_consumptions row should be FIFO's draw against
    // line 1 — the optional override must not have produced one.
    const optionalDraws = consumptions.filter((c) => c.batchId === optionalBatchId);
    expect(optionalDraws).toEqual([]);

    const optional = db.select().from(batches).where(eq(batches.id, optionalBatchId)).all()[0];
    expect(optional?.qtyRemaining).toBe(100);

    const run = db.select().from(recipeRuns).where(eq(recipeRuns.id, result.recipeRunId)).all()[0];
    expect(run?.notes ?? '').not.toContain('cook-override');
  });

  it('returns ShortfallUnresolved when the chosen batch was depleted between modal read and cook write', async () => {
    const seed = seedCompiledRecipe('override-depleted');
    // The modal showed the user a batch with 500g; by the time the cook
    // mutation runs, a concurrent consume has drawn it down to 50g. The
    // override request for 200g can no longer be satisfied.
    const depletedBatchId = seedBatch(seed.variantId, 50);

    const result = await caller.food.cook.markCooked({
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

    // Roll-back invariant: the half-applied draw must not survive.
    const db = getDrizzle();
    const depleted = db.select().from(batches).where(eq(batches.id, depletedBatchId)).all()[0];
    expect(depleted?.qtyRemaining).toBe(50);
    const consumptions = db.select().from(batchConsumptions).all();
    expect(consumptions).toEqual([]);
  });

  it('rejects a zero-qty batch-override so it cannot mask the line from FIFO', async () => {
    const seed = seedCompiledRecipe('override-zero-qty');
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

  it('rejects a batch-override pointing at a batch with a different variant', async () => {
    const seed = seedCompiledRecipe('override-wrong-variant');
    seedBatch(seed.variantId, 1000);
    // Seed a batch on the yield-side variant (unrelated to the recipe line).
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

  it('rejects an override whose qty does not cover the full scaled line need', async () => {
    // The line needs 200g × 1.5 = 300g. A `consumeQty: 100` override
    // would otherwise mark the line "covered" and silently skip FIFO
    // for the remaining 200g — that is the bug the qty-coverage guard
    // exists to stop.
    const seed = seedCompiledRecipe('override-qty-mismatch');
    seedBatch(seed.variantId, 1000);
    const overrideBatchId = seedBatch(seed.variantId, 1000);
    const result = await caller.food.cook.markCooked({
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

    // Roll-back invariant: no partial draw should have landed.
    const db = getDrizzle();
    const override = db.select().from(batches).where(eq(batches.id, overrideBatchId)).all()[0];
    expect(override?.qtyRemaining).toBe(1000);
    const consumptions = db.select().from(batchConsumptions).all();
    expect(consumptions).toEqual([]);
  });

  it('rejects an external override whose unit does not match the line canonical unit', async () => {
    const seed = seedCompiledRecipe('override-unit-mismatch');
    seedBatch(seed.variantId, 1000);
    const result = await caller.food.cook.markCooked({
      recipeVersionId: seed.versionId,
      scaleFactor: 1,
      yield: { qty: 800, unit: 'g', location: 'fridge' },
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'external',
          externalQty: 200,
          externalUnit: 'ml',
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'ShortfallUnresolved' });
  });
});
