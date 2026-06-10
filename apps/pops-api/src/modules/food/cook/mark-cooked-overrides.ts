/**
 * Apply PRD-146 `ConsumptionOverride[]` rows inside PRD-144's
 * `markCooked` transaction.
 *
 * Per the PRD-146 claim, the override-processing logic for the cook
 * mutation lives here — PRD-146 owns the modal-side resolution UX, and
 * delegates the persistence step to PRD-144 so the whole cook-finalisation
 * surface stays single-owner.
 *
 *   - `batch-override` → INSERT one `batch_consumptions` row + decrement
 *     the chosen batch's `qty_remaining`.
 *   - `external`       → append an audit line to `recipe_runs.notes`.
 *   - `partial`        → both of the above on a single line.
 *
 * The function returns the set of `recipe_lines.position` values that the
 * override array covered. The remaining lines fall through to PRD-108's
 * FIFO `consumeForRun`.
 */
import { eq } from 'drizzle-orm';

import { batchConsumptions, batches, recipeLines } from '@pops/app-food-db';

import type { ConsumptionOverride, FoodDb, MarkCookedError } from '@pops/app-food-db';

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
    // PRD-146 §"Integration with PRD-144's cook mutation": optional
    // lines never reach FIFO (see `computeRemainingNeeds` filter) so any
    // override the modal sent for one is silently dropped. Without this
    // guard a batch-override on an optional line would write a stray
    // `batch_consumptions` row that no longer maps to a tracked need.
    if (line.optional) continue;
    const outcome = processOverride(tx, args.runId, o, line);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };
    covered.add(o.lineIndex);
    if (outcome.auditLine !== null) auditLines.push(outcome.auditLine);
  }

  return { ok: true, coveredLineIndices: covered, auditLines };
}

type OverrideOutcome =
  | { ok: true; auditLine: string | null }
  | { ok: false; reason: MarkCookedError };

function processOverride(
  tx: FoodDb,
  runId: number,
  override: ConsumptionOverride,
  line: LineDescriptor
): OverrideOutcome {
  if (override.kind === 'external') return processExternal(override);
  return processBatchDraw(tx, runId, override, line);
}

function processExternal(
  override: Extract<ConsumptionOverride, { kind: 'external' }>
): OverrideOutcome {
  // External overrides must report a positive qty too, else they're a
  // no-op that hides the line from FIFO.
  if (override.externalQty <= 0) return { ok: false, reason: 'ShortfallUnresolved' };
  return {
    ok: true,
    auditLine: formatExternalNote(override.lineIndex, override.externalQty, override.externalUnit),
  };
}

function processBatchDraw(
  tx: FoodDb,
  runId: number,
  override: Extract<ConsumptionOverride, { kind: 'batch-override' | 'partial' }>,
  line: LineDescriptor
): OverrideOutcome {
  // Reject a zero-qty batch draw outright (Copilot R1): without this
  // gate, a client could send `consumeQty: 0` to mark a line as covered
  // and skip FIFO consumption entirely.
  if (override.consumeQty <= 0) return { ok: false, reason: 'ShortfallUnresolved' };
  const draw = drawFromBatch({
    tx,
    runId,
    batchId: override.batchId,
    qty: override.consumeQty,
    unit: override.unit,
    expectedVariantId: line.variantId,
    expectedPrepStateId: line.prepStateId,
  });
  if (!draw.ok) return { ok: false, reason: 'ShortfallUnresolved' };
  if (override.kind === 'batch-override') return { ok: true, auditLine: null };
  return {
    ok: true,
    auditLine: formatExternalNote(override.lineIndex, override.externalQty, override.unit),
  };
}

const EMPTY_SET: ReadonlySet<number> = new Set<number>();

interface LineDescriptor {
  position: number;
  variantId: number | null;
  prepStateId: number | null;
  optional: boolean;
}

function buildLineIndex(tx: FoodDb, versionId: number): Map<number, LineDescriptor> {
  const rows = tx
    .select({
      position: recipeLines.position,
      variantId: recipeLines.variantId,
      prepStateId: recipeLines.prepStateId,
      optional: recipeLines.optional,
    })
    .from(recipeLines)
    .where(eq(recipeLines.recipeVersionId, versionId))
    .all();
  const map = new Map<number, LineDescriptor>();
  for (const r of rows) {
    map.set(r.position, {
      position: r.position,
      variantId: r.variantId ?? null,
      prepStateId: r.prepStateId ?? null,
      optional: r.optional === 1,
    });
  }
  return map;
}

interface DrawArgs {
  tx: FoodDb;
  runId: number;
  batchId: number;
  qty: number;
  unit: 'g' | 'ml' | 'count';
  expectedVariantId: number | null;
  expectedPrepStateId: number | null;
}

function drawFromBatch(args: DrawArgs): { ok: true } | { ok: false } {
  const { tx, runId, batchId, qty, unit, expectedVariantId, expectedPrepStateId } = args;
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
  // prep state than the recipe line they're covering (Copilot R1).
  // Without this guard a client could "cover" a tomato line by drawing
  // from an unrelated chicken batch.
  if (expectedVariantId !== null && batch.variantId !== expectedVariantId) return { ok: false };
  if (batch.prepStateId !== expectedPrepStateId) return { ok: false };
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
