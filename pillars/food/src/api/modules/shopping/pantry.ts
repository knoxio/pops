/**
 * Pantry subtraction — strict by `(variant_id, unit)` per PRD-152.
 *
 * Loads a SUM of `batches.qty_remaining` per `(variant_id, unit)` for every
 * variant referenced by the canonical-need set, filtered to non-deleted,
 * non-empty batches. Needs with `variantId === null` get pantry = 0
 * (`batches.variant_id` is NOT NULL — no way to match without a variant).
 *
 * A single query covers all variants in the need set — no per-need
 * round-trip.
 */
import { and, gt, inArray, isNull, sql } from 'drizzle-orm';

import { batches, type FoodDb } from '../../../db/index.js';
import { type CanonicalNeed } from './aggregate.js';
import { type CanonicalUnit } from './types.js';

export interface PantrySums {
  /** Map keyed by `<variantId>|<unit>` → summed qty_remaining. */
  byVariantUnit: Map<string, number>;
}

export function loadPantrySums(db: FoodDb, canonicalNeeds: readonly CanonicalNeed[]): PantrySums {
  const variantIds = collectVariantIds(canonicalNeeds);
  const byVariantUnit = new Map<string, number>();
  if (variantIds.length === 0) return { byVariantUnit };

  const rows = db
    .select({
      variantId: batches.variantId,
      unit: batches.unit,
      qty: sql<number>`sum(${batches.qtyRemaining})`,
    })
    .from(batches)
    .where(
      and(
        inArray(batches.variantId, [...variantIds]),
        gt(batches.qtyRemaining, 0),
        isNull(batches.deletedAt)
      )
    )
    .groupBy(batches.variantId, batches.unit)
    .all();

  for (const r of rows) {
    const qty = Number(r.qty ?? 0);
    if (qty <= 0) continue;
    byVariantUnit.set(pantryKey(r.variantId, r.unit), qty);
  }
  return { byVariantUnit };
}

export function pantryKey(variantId: number, unit: CanonicalUnit): string {
  return `${variantId}|${unit}`;
}

function collectVariantIds(needs: readonly CanonicalNeed[]): number[] {
  const set = new Set<number>();
  for (const n of needs) {
    if (n.variantId !== null) set.add(n.variantId);
  }
  return [...set];
}
