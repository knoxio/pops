/**
 * Internal helpers for `markCooked`.
 *
 * Exports:
 *   - `validatePreflight` — every `MarkCookedError` branch reachable
 *     before the transaction opens
 *   - `computeRemainingNeeds` — recipe_lines × scale minus
 *     overridden-line indices
 *   - `composeFinalNotes` — user notes + override audit lines, capped
 *   - `MarkCookedRollback` — sentinel thrown inside the tx to roll back
 */
import { and, eq } from 'drizzle-orm';

import { type FoodDb, planEntries, recipeLines, recipeVersions } from '../../../db/index.js';

import type { ConsumptionNeed, MarkCookedError, Shortfall } from '../../../domain/types/cook.js';
import type { MarkCookedArgs } from './mark-cooked.js';

const NOTES_CAP_CHARS = 1000;
const MIN_RATING = 1;
const MAX_RATING = 5;

interface PreflightOk {
  ok: true;
  yield: { variantId: number; prepStateId: number | null } | null;
}

type PreflightFail = { ok: false; reason: MarkCookedError };

export type PreflightResult = PreflightOk | PreflightFail;

export function validatePreflight(db: FoodDb, args: MarkCookedArgs): PreflightResult {
  const rangeError = validateRanges(args);
  if (rangeError !== null) return { ok: false, reason: rangeError };
  const versionRow = loadVersionRow(db, args.recipeVersionId);
  if (versionRow === null) return { ok: false, reason: 'RecipeVersionNotFound' };
  if (versionRow.compileStatus !== 'compiled') return { ok: false, reason: 'RecipeNotCompiled' };
  const yieldError = validateYieldShape(versionRow, args);
  if (yieldError !== null) return { ok: false, reason: yieldError };
  const planError = validatePlanEntry(db, args);
  if (planError !== null) return { ok: false, reason: planError };
  return { ok: true, yield: extractResolvedYield(versionRow, args) };
}

function validateRanges(args: MarkCookedArgs): MarkCookedError | null {
  if (!Number.isFinite(args.scaleFactor) || args.scaleFactor <= 0) return 'BadScaleFactor';
  if (args.yield !== undefined && args.yield.qty < 0) return 'BadYieldQty';
  if (args.rating !== undefined && (args.rating < MIN_RATING || args.rating > MAX_RATING)) {
    return 'BadRating';
  }
  // `producedAt` is set to the current instant inside the cook
  // transaction; we approximate it here with `Date.now()` so an
  // already-expired `expiresAt` fails before the tx opens. The
  // batch-lifecycle services apply the same rule on the manual-create
  // path, keeping `MarkCookedError.BadExpiry` reachable end-to-end.
  if (args.yield?.expiresAt !== undefined) {
    const expires = Date.parse(args.yield.expiresAt);
    if (Number.isNaN(expires) || expires < Date.now()) return 'BadExpiry';
  }
  return null;
}

interface VersionRow {
  id: number;
  compileStatus: string;
  yieldIngredientId: number | null;
  yieldVariantId: number | null;
  yieldPrepStateId: number | null;
}

function loadVersionRow(db: FoodDb, versionId: number): VersionRow | null {
  const rows = db
    .select({
      id: recipeVersions.id,
      compileStatus: recipeVersions.compileStatus,
      yieldIngredientId: recipeVersions.yieldIngredientId,
      yieldVariantId: recipeVersions.yieldVariantId,
      yieldPrepStateId: recipeVersions.yieldPrepStateId,
    })
    .from(recipeVersions)
    .where(eq(recipeVersions.id, versionId))
    .all();
  return rows[0] ?? null;
}

function validateYieldShape(version: VersionRow, args: MarkCookedArgs): MarkCookedError | null {
  // The yields-batch predicate mirrors the fields `createBatchFromRun`
  // actually needs: a recipe whose `yield_ingredient_id` is set but
  // `yield_variant_id` is null can't produce a batch, so we treat it as
  // yieldless rather than silently dropping the user-supplied yield.
  const yieldsBatch = version.yieldIngredientId !== null && version.yieldVariantId !== null;
  if (yieldsBatch && args.yield === undefined) return 'YieldRequired';
  if (!yieldsBatch && args.yield !== undefined) return 'YieldForbidden';
  return null;
}

function extractResolvedYield(
  version: VersionRow,
  args: MarkCookedArgs
): { variantId: number; prepStateId: number | null } | null {
  if (args.yield === undefined) return null;
  if (version.yieldVariantId === null) return null;
  return {
    variantId: version.yieldVariantId,
    prepStateId: version.yieldPrepStateId,
  };
}

function validatePlanEntry(db: FoodDb, args: MarkCookedArgs): MarkCookedError | null {
  if (args.planEntryId === undefined) return null;
  const row = db
    .select({ recipeRunId: planEntries.recipeRunId })
    .from(planEntries)
    .where(eq(planEntries.id, args.planEntryId))
    .all()[0];
  if (row === undefined) return 'PlanEntryNotFound';
  if (row.recipeRunId !== null) return 'PlanEntryAlreadyCooked';
  return null;
}

export function computeRemainingNeeds(
  tx: FoodDb,
  versionId: number,
  scaleFactor: number,
  coveredLineIndices: ReadonlySet<number>
): ConsumptionNeed[] {
  const rows = tx
    .select({
      position: recipeLines.position,
      variantId: recipeLines.variantId,
      prepStateId: recipeLines.prepStateId,
      qtyG: recipeLines.qtyG,
      qtyMl: recipeLines.qtyMl,
      qtyCount: recipeLines.qtyCount,
      canonicalUnit: recipeLines.canonicalUnit,
    })
    .from(recipeLines)
    .where(and(eq(recipeLines.recipeVersionId, versionId), eq(recipeLines.optional, 0)))
    .all();
  const needs: ConsumptionNeed[] = [];
  for (const r of rows) {
    if (coveredLineIndices.has(r.position)) continue;
    if (r.variantId === null) continue;
    const baseQty = canonicalQty(r);
    if (baseQty === null || baseQty <= 0) continue;
    needs.push({
      variantId: r.variantId,
      prepStateId: r.prepStateId ?? null,
      qty: baseQty * scaleFactor,
      canonicalUnit: r.canonicalUnit,
    });
  }
  return needs;
}

interface LineQtyRow {
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: 'g' | 'ml' | 'count';
}

function canonicalQty(row: LineQtyRow): number | null {
  if (row.canonicalUnit === 'g') return row.qtyG;
  if (row.canonicalUnit === 'ml') return row.qtyMl;
  return row.qtyCount;
}

export function composeFinalNotes(
  userNotes: string | null,
  auditLines: readonly string[]
): string | null {
  const parts: string[] = [];
  if (userNotes !== null && userNotes.length > 0) parts.push(userNotes);
  if (auditLines.length > 0) parts.push(...auditLines);
  if (parts.length === 0) return null;
  const joined = parts.join('\n');
  return joined.length > NOTES_CAP_CHARS ? joined.slice(0, NOTES_CAP_CHARS) : joined;
}

export class MarkCookedRollback extends Error {
  readonly reason: MarkCookedError;
  readonly shortfalls: readonly Shortfall[] | null;
  constructor(reason: MarkCookedError, shortfalls: readonly Shortfall[] | null = null) {
    super(reason);
    this.name = 'MarkCookedRollback';
    this.reason = reason;
    this.shortfalls = shortfalls;
  }
}
