/**
 * Apply `ConsumptionOverride[]` rows inside the `markCooked` transaction.
 *
 *   - `batch-override` → INSERT one `batch_consumptions` row + decrement
 *     the chosen batch's `qty_remaining`.
 *   - `external`       → append an audit line to `recipe_runs.notes`.
 *   - `partial`        → both of the above on a single line.
 *
 * Returns the set of `recipe_lines.position` values that the override
 * array covered. The remaining lines fall through to the FIFO
 * `consumeForRun` drain.
 */
import { eq } from 'drizzle-orm';

import { batchConsumptions, batches, type FoodDb, recipeLines } from '../../../db/index.js';
import { resolveSubstitutionContext, type LineDescriptor } from './mark-cooked-substitution.js';

import type { ConsumptionOverride, MarkCookedError } from '../../../domain/types/cook.js';

export interface ApplyOverridesArgs {
  runId: number;
  versionId: number;
  scaleFactor: number;
  overrides: readonly ConsumptionOverride[];
}

export type ApplyOverridesResult =
  | { ok: true; coveredLineIndices: ReadonlySet<number>; auditLines: readonly string[] }
  | { ok: false; reason: MarkCookedError };

export function applyConsumptionOverrides(
  tx: FoodDb,
  args: ApplyOverridesArgs
): ApplyOverridesResult {
  if (args.overrides.length === 0) {
    return { ok: true, coveredLineIndices: EMPTY_SET, auditLines: [] };
  }

  const lineIndex = buildLineIndex(tx, args.versionId);
  const covered = new Set<number>();
  const auditLines: string[] = [];

  for (const o of args.overrides) {
    const line = lineIndex.get(o.lineIndex);
    if (line === undefined) continue; // line position not in this version — silently skip
    // Optional lines never reach FIFO (see `computeRemainingNeeds`
    // filter) so any override the modal sent for one is silently dropped.
    // Without this guard a batch-override on an optional line would write
    // a stray `batch_consumptions` row that no longer maps to a tracked
    // need.
    if (line.optional) continue;
    // Refuse to mark a line "covered" unless the override accounts for
    // the full scaled need. Without this gate a client can send
    // `consumeQty: 1` on a 200g line, get added to `coveredLineIndices`,
    // and silently bypass FIFO for the remaining 199g.
    if (!overrideCoversLine(o, line, args.scaleFactor)) {
      return { ok: false, reason: 'ShortfallUnresolved' };
    }
    const result = applyOneOverride(tx, args.runId, line, o);
    if (!result.ok) return { ok: false, reason: result.reason };
    covered.add(o.lineIndex);
    for (const note of result.auditNotes) auditLines.push(note);
  }

  return { ok: true, coveredLineIndices: covered, auditLines };
}

type OverrideResult =
  | { ok: true; auditNotes: readonly string[] }
  | { ok: false; reason: MarkCookedError };

function applyOneOverride(
  tx: FoodDb,
  runId: number,
  line: LineDescriptor,
  o: ConsumptionOverride
): OverrideResult {
  if (o.kind === 'external') {
    if (o.externalQty <= 0) return { ok: false, reason: 'ShortfallUnresolved' };
    return {
      ok: true,
      auditNotes: [formatExternalNote(o.lineIndex, o.externalQty, o.externalUnit)],
    };
  }
  // `batch-override` and `partial` share the batch-draw path.
  if (o.consumeQty <= 0) return { ok: false, reason: 'ShortfallUnresolved' };
  const subContext = resolveSubstitutionContext({
    tx,
    edgeId: o.substitutionEdgeId,
    batchId: o.batchId,
    line,
  });
  if (!subContext.ok) return { ok: false, reason: 'SubstitutionEdgeInvalid' };
  const draw = drawFromBatch({
    tx,
    runId,
    batchId: o.batchId,
    qty: o.consumeQty,
    unit: o.unit,
    expectedVariantId: subContext.expectedVariantId,
    expectedPrepStateId: subContext.expectedPrepStateId,
    ignorePrepStateMismatch: o.substitutionEdgeId !== undefined,
  });
  if (!draw.ok) return { ok: false, reason: 'ShortfallUnresolved' };
  const notes: string[] = [];
  if (subContext.auditNote !== null) notes.push(subContext.auditNote);
  if (o.kind === 'partial') {
    notes.push(formatExternalNote(o.lineIndex, o.externalQty, o.unit));
  }
  return { ok: true, auditNotes: notes };
}

const EMPTY_SET: ReadonlySet<number> = new Set<number>();

// Float-comparison tolerance for override qty validation. SQLite stores
// qty columns as REAL so a 1e-6 epsilon keeps us off the rounding edge
// without admitting a meaningful shortfall.
const QTY_EPSILON = 1e-6;

function buildLineIndex(tx: FoodDb, versionId: number): Map<number, LineDescriptor> {
  const rows = tx
    .select({
      position: recipeLines.position,
      variantId: recipeLines.variantId,
      prepStateId: recipeLines.prepStateId,
      optional: recipeLines.optional,
      qtyG: recipeLines.qtyG,
      qtyMl: recipeLines.qtyMl,
      qtyCount: recipeLines.qtyCount,
      canonicalUnit: recipeLines.canonicalUnit,
    })
    .from(recipeLines)
    .where(eq(recipeLines.recipeVersionId, versionId))
    .all();
  const map = new Map<number, LineDescriptor>();
  for (const r of rows) {
    const need = canonicalQty(r);
    map.set(r.position, {
      position: r.position,
      variantId: r.variantId ?? null,
      prepStateId: r.prepStateId ?? null,
      optional: r.optional === 1,
      needQty: need,
      canonicalUnit: r.canonicalUnit,
    });
  }
  return map;
}

function canonicalQty(row: {
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: 'g' | 'ml' | 'count';
}): number {
  if (row.canonicalUnit === 'g') return row.qtyG ?? 0;
  if (row.canonicalUnit === 'ml') return row.qtyMl ?? 0;
  return row.qtyCount ?? 0;
}

function overrideCoversLine(
  override: ConsumptionOverride,
  line: LineDescriptor,
  scaleFactor: number
): boolean {
  const required = line.needQty * scaleFactor;
  if (required <= 0) return true;
  if (override.kind === 'external') {
    if (override.externalUnit !== line.canonicalUnit) return false;
    return Math.abs(override.externalQty - required) <= QTY_EPSILON;
  }
  if (override.unit !== line.canonicalUnit) return false;
  const supplied =
    override.kind === 'partial' ? override.consumeQty + override.externalQty : override.consumeQty;
  return Math.abs(supplied - required) <= QTY_EPSILON;
}

interface DrawArgs {
  tx: FoodDb;
  runId: number;
  batchId: number;
  qty: number;
  unit: 'g' | 'ml' | 'count';
  expectedVariantId: number | null;
  expectedPrepStateId: number | null;
  /**
   * Set true when the override carries a `substitutionEdgeId`, since the
   * sub batch's prep state may legitimately differ from the line's per the
   * prep-mismatch-is-informational rule
   * (pillars/food/docs/prds/cook-time-substitutions).
   */
  ignorePrepStateMismatch?: boolean;
}

function drawFromBatch(args: DrawArgs): { ok: true } | { ok: false } {
  const {
    tx,
    runId,
    batchId,
    qty,
    unit,
    expectedVariantId,
    expectedPrepStateId,
    ignorePrepStateMismatch,
  } = args;
  if (qty <= 0) return { ok: false };
  const rows = tx
    .select({
      id: batches.id,
      qtyRemaining: batches.qtyRemaining,
      unit: batches.unit,
      variantId: batches.variantId,
      prepStateId: batches.prepStateId,
      deletedAt: batches.deletedAt,
    })
    .from(batches)
    .where(eq(batches.id, batchId))
    .all();
  const batch = rows[0];
  if (batch === undefined) return { ok: false };
  if (batch.deletedAt !== null) return { ok: false };
  if (batch.unit !== unit) return { ok: false };
  // Reject overrides that point at a batch with a different variant /
  // prep state than the recipe line they're covering. Without this guard
  // a client could "cover" a tomato line by drawing from an unrelated
  // chicken batch.
  if (expectedVariantId !== null && batch.variantId !== expectedVariantId) return { ok: false };
  if (ignorePrepStateMismatch !== true && batch.prepStateId !== expectedPrepStateId) {
    return { ok: false };
  }
  if (batch.qtyRemaining < qty) return { ok: false };

  tx.update(batches)
    .set({ qtyRemaining: batch.qtyRemaining - qty })
    .where(eq(batches.id, batchId))
    .run();
  tx.insert(batchConsumptions)
    .values({ recipeRunId: runId, batchId, qtyConsumed: qty, unit })
    .run();
  return { ok: true };
}

function formatExternalNote(lineIndex: number, qty: number, unit: 'g' | 'ml' | 'count'): string {
  return `cook-override:external line=${lineIndex} qty=${qty} unit=${unit}`;
}
