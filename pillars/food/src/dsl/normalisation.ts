/**
 * Wraps `resolveCanonicalQty` so the compile pipeline has a single helper
 * per ingredient line. The fallback contract (unresolved → ingredient's
 * `default_unit` with null qty) lives here, so compile stays oblivious to
 * the resolution algorithm.
 */
import * as conversionsService from '../db/services/conversions.js';

import type { CanonicalUnit } from '../db/schema.js';
import type { FoodDb } from '../db/services/internal.js';

const { resolveCanonicalQty } = conversionsService;

export interface NormaliseLineInput {
  ingredientId: number;
  variantId: number | null;
  unit: string;
  qty: number;
  /** Ingredient's `default_unit` — used when no conversion is found. */
  ingredientDefaultUnit: CanonicalUnit;
}

export interface NormalisedLine {
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: CanonicalUnit;
}

export function normaliseLineQty(db: FoodDb, input: NormaliseLineInput): NormalisedLine {
  const resolved = resolveCanonicalQty(db, {
    ingredientId: input.ingredientId,
    variantId: input.variantId,
    unit: input.unit,
    qty: input.qty,
  });
  if (resolved.kind === 'unresolved') {
    return {
      qtyG: null,
      qtyMl: null,
      qtyCount: null,
      canonicalUnit: input.ingredientDefaultUnit,
    };
  }
  return {
    qtyG: resolved.canonicalUnit === 'g' ? resolved.qty : null,
    qtyMl: resolved.canonicalUnit === 'ml' ? resolved.qty : null,
    qtyCount: resolved.canonicalUnit === 'count' ? resolved.qty : null,
    canonicalUnit: resolved.canonicalUnit,
  };
}
