/**
 * `food.cook.markCooked` — transactional cook mutation.
 *
 * One Drizzle transaction wraps:
 *   1. recipe_runs INSERT (with scale + rating + notes)
 *   2. consumption-override application
 *   3. `consumeForRun` against the remaining (non-overridden,
 *      non-optional) needs
 *   4. `createBatchFromRun` (sets `completed_at` for yieldless too and
 *      INSERTs the yielded batch when `yield` is given)
 *   5. plan_entries.recipe_run_id link
 *
 * Failures roll the whole thing back via a private sentinel.
 */
import { and, eq, isNull } from 'drizzle-orm';

import {
  batchesLifecycleService,
  batchesService,
  type FoodDb,
  planEntries,
  recipeRuns,
  recipeRunsService,
} from '../../../db/index.js';
import {
  composeFinalNotes,
  computeRemainingNeeds,
  MarkCookedRollback,
  validatePreflight,
  type PreflightResult,
} from './mark-cooked-helpers.js';
import { applyConsumptionOverrides } from './mark-cooked-overrides.js';

import type { YieldArgs } from '../../../domain/types/batches.js';
import type {
  ConsumptionOverride,
  CookYieldInput,
  MarkCookedResult,
} from '../../../domain/types/cook.js';

export interface MarkCookedArgs {
  recipeVersionId: number;
  scaleFactor: number;
  planEntryId?: number;
  yield?: CookYieldInput;
  rating?: number;
  notes?: string;
  consumptionOverrides?: readonly ConsumptionOverride[];
}

export function markCooked(db: FoodDb, args: MarkCookedArgs): MarkCookedResult {
  const validation = validatePreflight(db, args);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  try {
    return db.transaction((tx): MarkCookedResult => runCookTransaction(tx, args, validation));
  } catch (err) {
    if (err instanceof MarkCookedRollback) {
      if (err.shortfalls !== null) {
        return { ok: false, reason: err.reason, shortfalls: err.shortfalls };
      }
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

function runCookTransaction(
  tx: FoodDb,
  args: MarkCookedArgs,
  validation: Extract<PreflightResult, { ok: true }>
): MarkCookedResult {
  const run = recipeRunsService.createRun(tx, {
    recipeVersionId: args.recipeVersionId,
    scaleFactor: args.scaleFactor,
    startedAt: new Date().toISOString(),
  });
  const overrides = applyConsumptionOverrides(tx, {
    runId: run.id,
    overrides: args.consumptionOverrides ?? [],
    versionId: args.recipeVersionId,
    scaleFactor: args.scaleFactor,
  });
  if (!overrides.ok) throw new MarkCookedRollback(overrides.reason);

  const remainingNeeds = computeRemainingNeeds(
    tx,
    args.recipeVersionId,
    args.scaleFactor,
    overrides.coveredLineIndices
  );
  const consume = batchesService.consumeForRun(tx, run.id, remainingNeeds);
  if (!consume.ok) throw new MarkCookedRollback('ShortfallUnresolved', consume.shortfalls);

  const yieldArgs = buildYieldArgs(args.yield, validation.yield);
  const created = batchesLifecycleService.createBatchFromRun(tx, run.id, yieldArgs);

  finaliseRunRow(tx, run.id, args, overrides.auditLines);
  // Plan-entry link is a conditional UPDATE on `recipe_run_id IS NULL`
  // so a parallel cook racing past preflight can't overwrite the first
  // run's id. On zero affected rows we roll back via the shared rollback
  // sentinel.
  if (!linkPlanEntry(tx, run.id, args.planEntryId)) {
    throw new MarkCookedRollback('PlanEntryAlreadyCooked');
  }

  return { ok: true, recipeRunId: run.id, yieldedBatchId: created.batchId };
}

function buildYieldArgs(
  input: CookYieldInput | undefined,
  resolved: { variantId: number; prepStateId: number | null } | null
): YieldArgs | null {
  if (input === undefined || resolved === null) return null;
  return {
    variantId: resolved.variantId,
    prepStateId: resolved.prepStateId,
    qty: input.qty,
    unit: input.unit,
    location: input.location,
    expiresAt: input.expiresAt,
    notes: input.notes,
  };
}

function finaliseRunRow(
  tx: FoodDb,
  runId: number,
  args: MarkCookedArgs,
  auditLines: readonly string[]
): void {
  // `createBatchFromRun` (via `markRunComplete`) sets `recipe_runs.notes`
  // + `rating` to null because the wrapper doesn't thread them through.
  // Compose the final values here.
  const finalNotes = composeFinalNotes(args.notes ?? null, auditLines);
  const rating = args.rating ?? null;
  if (rating === null && finalNotes === null) return;
  tx.update(recipeRuns).set({ rating, notes: finalNotes }).where(eq(recipeRuns.id, runId)).run();
}

function linkPlanEntry(tx: FoodDb, runId: number, planEntryId: number | undefined): boolean {
  if (planEntryId === undefined) return true;
  const result = tx
    .update(planEntries)
    .set({ recipeRunId: runId })
    .where(and(eq(planEntries.id, planEntryId), isNull(planEntries.recipeRunId)))
    .run();
  // better-sqlite3 returns `{ changes }` so we can detect the race-lost
  // case at the SQL boundary instead of re-SELECTing.
  return result.changes > 0;
}
