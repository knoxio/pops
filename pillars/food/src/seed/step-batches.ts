/**
 * Seed step — batches + recipe_runs + batch_consumptions.
 *
 * Inserts via Drizzle (no `createBatch` service). The single seeded
 * `recipe_runs` row + its `batch_consumptions` exercise the fridge view's
 * read path.
 *
 * Order matters:
 *   1. Seed `recipe_runs` (no batches yet → `yielded_batch_id` left null).
 *   2. Insert batches; one of them carries `source_type='recipe_run'` and
 *      `source_id` = the seeded run id.
 *   3. Patch the seeded run's `yielded_batch_id` to point at that batch.
 *   4. Record the `batch_consumptions` rows tying the run to existing batches.
 */
import { eq } from 'drizzle-orm';

import { batchConsumptions, batches, recipeRuns } from '../db/schema.js';
import { BATCH_FIXTURES, RECIPE_RUN_FIXTURE, type BatchFixture } from './data-batches.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

function isoOffsetDays(offsetDays: number): string {
  const base = new Date('2026-06-10T08:00:00Z');
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString();
}

function variantIdFor(fixture: BatchFixture, ctx: SeedContext): number {
  const key = `${fixture.variantOfIngredient}:${fixture.variantSlug}`;
  const id = ctx.variantIdByCompositeSlug.get(key);
  if (id === undefined) throw new Error(`Batch refers to unknown variant "${key}"`);
  return id;
}

function prepStateIdFor(fixture: BatchFixture, ctx: SeedContext): number | null {
  if (fixture.prepStateSlug === undefined) return null;
  const id = ctx.prepStateIdBySlug.get(fixture.prepStateSlug);
  if (id === undefined) {
    throw new Error(`Batch refers to unknown prep_state "${fixture.prepStateSlug}"`);
  }
  return id;
}

function insertRecipeRunRow(db: FoodDb, ctx: SeedContext): number {
  const versionId = ctx.recipeVersionIdByRecipeSlug.get(RECIPE_RUN_FIXTURE.recipeSlug);
  if (versionId === undefined) {
    throw new Error(`Seed run references unknown recipe "${RECIPE_RUN_FIXTURE.recipeSlug}"`);
  }
  const rows = db
    .insert(recipeRuns)
    .values({
      recipeVersionId: versionId,
      startedAt: isoOffsetDays(RECIPE_RUN_FIXTURE.startedAtOffsetDays),
      completedAt: isoOffsetDays(RECIPE_RUN_FIXTURE.completedAtOffsetDays),
      scaleFactor: RECIPE_RUN_FIXTURE.scaleFactor,
      yieldedBatchId: null,
      rating: RECIPE_RUN_FIXTURE.rating,
      notes: RECIPE_RUN_FIXTURE.notes ?? null,
    })
    .returning()
    .all();
  const row = rows[0];
  if (row === undefined) throw new Error('Seed recipe_runs insert returned no row');
  ctx.recipeRunIdByRecipeSlug.set(RECIPE_RUN_FIXTURE.recipeSlug, row.id);
  return row.id;
}

function batchSourceId(fixture: BatchFixture, runId: number): number | null {
  if (fixture.sourceType !== 'recipe_run') return null;
  // Defensive: a recipe_run batch fixture must name the run it points at.
  // Otherwise the source_id would silently fall back to NULL — defeating the
  // provenance the source_type=recipe_run row was supposed to record.
  if (fixture.recipeRunRecipeSlug === undefined) {
    throw new Error(
      `Batch fixture has sourceType='recipe_run' but no recipeRunRecipeSlug — provenance would be lost`
    );
  }
  if (fixture.recipeRunRecipeSlug !== RECIPE_RUN_FIXTURE.recipeSlug) {
    // Only one run is seeded; assert the fixture points at that one so adding
    // a second run forces the seeder to be updated rather than silently
    // misattributing the batch.
    throw new Error(
      `Batch fixture recipeRunRecipeSlug "${fixture.recipeRunRecipeSlug}" does not match the seeded run "${RECIPE_RUN_FIXTURE.recipeSlug}"`
    );
  }
  return runId;
}

function insertOneBatch(
  db: FoodDb,
  fixture: BatchFixture,
  ctx: SeedContext,
  runId: number
): number {
  const sourceId = batchSourceId(fixture, runId);
  const inserted = db
    .insert(batches)
    .values({
      variantId: variantIdFor(fixture, ctx),
      prepStateId: prepStateIdFor(fixture, ctx),
      qtyRemaining: fixture.qtyRemaining,
      unit: fixture.unit,
      sourceType: fixture.sourceType,
      sourceId,
      location: fixture.location,
      producedAt: fixture.producedAt,
      expiresAt: fixture.expiresAt,
      notes: fixture.notes ?? null,
    })
    .returning()
    .all();
  const row = inserted[0];
  if (row === undefined) throw new Error('Seed batches insert returned no row');
  return row.id;
}

function insertAllBatches(
  db: FoodDb,
  ctx: SeedContext,
  runId: number
): { batchIds: readonly number[]; yieldedBatchId: number | null } {
  const batchIds: number[] = [];
  let yieldedBatchId: number | null = null;
  for (const fixture of BATCH_FIXTURES) {
    const id = insertOneBatch(db, fixture, ctx, runId);
    batchIds.push(id);
    if (fixture.sourceType === 'recipe_run') yieldedBatchId = id;
  }
  return { batchIds, yieldedBatchId };
}

function insertConsumptions(db: FoodDb, runId: number, batchIds: readonly number[]): number {
  let count = 0;
  for (const consume of RECIPE_RUN_FIXTURE.consumes) {
    const batchId = batchIds[consume.fromBatchIndex];
    if (batchId === undefined) {
      throw new Error(`Seed consumption refs batch index ${consume.fromBatchIndex} (out of range)`);
    }
    db.insert(batchConsumptions)
      .values({
        recipeRunId: runId,
        batchId,
        qtyConsumed: consume.qtyConsumed,
        unit: consume.unit,
      })
      .run();
    count += 1;
  }
  return count;
}

export function seedBatches(
  db: FoodDb,
  ctx: SeedContext
): { batches: number; recipeRuns: number; batchConsumptions: number } {
  const runId = insertRecipeRunRow(db, ctx);
  const { batchIds, yieldedBatchId } = insertAllBatches(db, ctx, runId);
  if (yieldedBatchId !== null) {
    db.update(recipeRuns).set({ yieldedBatchId }).where(eq(recipeRuns.id, runId)).run();
  }
  const consumed = insertConsumptions(db, runId, batchIds);
  return { batches: batchIds.length, recipeRuns: 1, batchConsumptions: consumed };
}
