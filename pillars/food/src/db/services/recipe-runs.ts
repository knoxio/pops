import { eq } from 'drizzle-orm';

import { CannotCookUncompiledRecipe } from '../errors.js';
import {
  batches,
  ingredientVariants,
  recipeRuns,
  recipeVersions,
  type BatchRow,
  type RecipeRunRow,
} from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

export interface CreateRunInput {
  recipeVersionId: number;
  scaleFactor?: number;
  startedAt?: string | null;
}

export function createRun(db: FoodDb, input: CreateRunInput): RecipeRunRow {
  const rows = db
    .insert(recipeRuns)
    .values({
      recipeVersionId: input.recipeVersionId,
      scaleFactor: input.scaleFactor ?? 1.0,
      startedAt: input.startedAt ?? null,
    })
    .returning()
    .all();
  return expectRow(rows, 'createRun');
}

export interface YieldArgs {
  /** Variant of the produced ingredient. Must already exist. */
  variantId: number;
  prepStateId?: number | null;
  /** Quantity produced, in `unit`. Required when `yield` is given. */
  qty: number;
  unit: 'g' | 'ml' | 'count';
  /** Where the batch lives after cook. Drives the shelf-life default. */
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  /**
   * Override the auto-derived `expires_at`. If omitted, the service looks
   * up the variant's `default_shelf_life_days_<location>` and computes
   * `producedAt + days`. If the variant has no default for the chosen
   * location, `expires_at` stays NULL (shelf-stable).
   */
  expiresAt?: string | null;
  notes?: string | null;
}

export interface MarkRunCompleteOpts {
  /** Override `completed_at` (default: now in ISO). */
  completedAt?: string;
  rating?: number | null;
  notes?: string | null;
  /** Component recipes set this; yieldless cooks leave it absent. */
  yield?: YieldArgs;
}

export interface MarkRunCompleteResult {
  run: RecipeRunRow;
  yieldedBatch: BatchRow | null;
}

/**
 * Finalise a recipe run. Sets `completed_at` and (when `opts.yield` is
 * given) creates the produced batch and writes its id back to
 * `recipe_runs.yielded_batch_id`. All writes happen in one transaction.
 *
 * Refuses to complete a run whose recipe_version isn't `compiled` — the
 * planner / consumption helper need materialised `recipe_lines`.
 */
export function markRunComplete(
  db: FoodDb,
  runId: number,
  opts: MarkRunCompleteOpts = {}
): MarkRunCompleteResult {
  return db.transaction((tx) => {
    const runRows = tx
      .select({
        id: recipeRuns.id,
        recipeVersionId: recipeRuns.recipeVersionId,
      })
      .from(recipeRuns)
      .where(eq(recipeRuns.id, runId))
      .all();
    const run = expectRow(runRows, `markRunComplete(${runId}) run lookup`);

    const versionRows = tx
      .select({ compileStatus: recipeVersions.compileStatus })
      .from(recipeVersions)
      .where(eq(recipeVersions.id, run.recipeVersionId))
      .all();
    const version = expectRow(versionRows, `markRunComplete(${runId}) version lookup`);
    if (version.compileStatus !== 'compiled') {
      throw new CannotCookUncompiledRecipe(
        run.recipeVersionId,
        version.compileStatus as 'uncompiled' | 'failed'
      );
    }

    const completedAt = opts.completedAt ?? new Date().toISOString();
    let yieldedBatch: BatchRow | null = null;

    if (opts.yield !== undefined) {
      yieldedBatch = createBatchForYield(tx, runId, completedAt, opts.yield);
    }

    const updated = tx
      .update(recipeRuns)
      .set({
        completedAt,
        rating: opts.rating ?? null,
        notes: opts.notes ?? null,
        yieldedBatchId: yieldedBatch?.id ?? null,
      })
      .where(eq(recipeRuns.id, runId))
      .returning()
      .all();
    return { run: expectRow(updated, `markRunComplete(${runId}) update`), yieldedBatch };
  });
}

function createBatchForYield(
  tx: FoodDb,
  runId: number,
  producedAt: string,
  args: YieldArgs
): BatchRow {
  const expiresAt =
    args.expiresAt !== undefined ? args.expiresAt : deriveExpiry(tx, args, producedAt);
  const rows = tx
    .insert(batches)
    .values({
      variantId: args.variantId,
      prepStateId: args.prepStateId ?? null,
      qtyRemaining: args.qty,
      unit: args.unit,
      sourceType: 'recipe_run',
      sourceId: runId,
      location: args.location,
      producedAt,
      expiresAt,
      notes: args.notes ?? null,
    })
    .returning()
    .all();
  return expectRow(rows, 'createBatchForYield');
}

/**
 * Resolve the auto-derived `expires_at` from the variant's shelf-life
 * column for the chosen location. Returns null when the variant has no
 * default for that location (shelf-stable).
 */
function deriveExpiry(tx: FoodDb, args: YieldArgs, producedAt: string): string | null {
  if (args.location === 'pantry' || args.location === 'other') return null;
  const variantRows = tx
    .select({
      fridge: ingredientVariants.defaultShelfLifeDaysFridge,
      freezer: ingredientVariants.defaultShelfLifeDaysFreezer,
    })
    .from(ingredientVariants)
    .where(eq(ingredientVariants.id, args.variantId))
    .all();
  const variant = variantRows[0];
  if (variant === undefined) return null;
  const days = args.location === 'fridge' ? variant.fridge : variant.freezer;
  if (days === null) return null;
  const base = new Date(producedAt);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}
