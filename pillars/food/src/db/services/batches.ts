/**
 * `consumeForRun` decrements `batches.qty_remaining` in FIFO order
 * (`expires_at NULLS LAST, produced_at ASC`) inside one transaction — any
 * shortfall rolls back every decrement.
 */
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';

import { batchConsumptions, batches, type BatchConsumptionRow } from '../schema.js';
import { type FoodDb } from './internal.js';

export interface ConsumptionNeed {
  variantId: number;
  /** null = default/whole bucket; matches `batches.prep_state_id IS NULL`. */
  prepStateId: number | null;
  /** Quantity needed, in canonical metric (from `recipe_lines` / yield). */
  qty: number;
  canonicalUnit: 'g' | 'ml' | 'count';
}

export interface Shortfall {
  variantId: number;
  prepStateId: number | null;
  needed: number;
  available: number;
  unit: 'g' | 'ml' | 'count';
}

export type ConsumptionResult =
  | { ok: true; consumptions: readonly BatchConsumptionRow[] }
  | { ok: false; shortfalls: readonly Shortfall[] };

/**
 * Consume batches FIFO for a given run. Returns `{ ok: true, consumptions }`
 * on success or `{ ok: false, shortfalls }` on any per-need shortage.
 * Either way the transaction is committed only on success — shortfalls
 * roll back via a thrown sentinel + re-thrown rejection.
 */
export function consumeForRun(
  db: FoodDb,
  runId: number,
  needs: readonly ConsumptionNeed[]
): ConsumptionResult {
  try {
    return db.transaction((tx): { ok: true; consumptions: readonly BatchConsumptionRow[] } => {
      const consumptions: BatchConsumptionRow[] = [];
      const shortfalls: Shortfall[] = [];

      for (const need of needs) {
        if (need.qty <= 0) continue;
        const remaining = drawFromBatches(tx, runId, need, consumptions);
        if (remaining > 0) {
          shortfalls.push({
            variantId: need.variantId,
            prepStateId: need.prepStateId,
            needed: need.qty,
            available: need.qty - remaining,
            unit: need.canonicalUnit,
          });
        }
      }

      if (shortfalls.length > 0) {
        throw new ShortfallRollback(shortfalls);
      }
      return { ok: true, consumptions };
    });
  } catch (err) {
    if (err instanceof ShortfallRollback) {
      return { ok: false, shortfalls: err.shortfalls };
    }
    throw err;
  }
}

/**
 * Drain `need.qty` from FIFO-ordered batches matching variant + prep_state.
 * Returns the remaining unmet need (0 = fully satisfied).
 *
 * The batch's stored `unit` must equal `need.canonicalUnit` — recipe_lines
 * carry the canonical metric and batches store in that same unit (no
 * cross-unit conversion at consume time).
 */
function drawFromBatches(
  tx: FoodDb,
  runId: number,
  need: ConsumptionNeed,
  out: BatchConsumptionRow[]
): number {
  const matching = tx
    .select()
    .from(batches)
    .where(
      and(
        eq(batches.variantId, need.variantId),
        need.prepStateId === null
          ? isNull(batches.prepStateId)
          : eq(batches.prepStateId, need.prepStateId),
        eq(batches.unit, need.canonicalUnit),
        gt(batches.qtyRemaining, 0)
      )
    )
    .orderBy(sql`${batches.expiresAt} IS NULL`, asc(batches.expiresAt), asc(batches.producedAt))
    .all();

  let remaining = need.qty;
  for (const batch of matching) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.qtyRemaining);
    tx.update(batches)
      .set({ qtyRemaining: batch.qtyRemaining - take })
      .where(eq(batches.id, batch.id))
      .run();
    const consumed = tx
      .insert(batchConsumptions)
      .values({
        recipeRunId: runId,
        batchId: batch.id,
        qtyConsumed: take,
        unit: need.canonicalUnit,
      })
      .returning()
      .all();
    const row = consumed[0];
    if (row !== undefined) out.push(row);
    remaining -= take;
  }
  return remaining;
}

/** Internal sentinel — used to roll back the transaction on shortfall. */
class ShortfallRollback extends Error {
  readonly shortfalls: readonly Shortfall[];
  constructor(shortfalls: readonly Shortfall[]) {
    super('shortfall — rolling back');
    this.name = 'ShortfallRollback';
    this.shortfalls = shortfalls;
  }
}
