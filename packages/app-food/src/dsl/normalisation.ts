/**
 * Recipe-line unit normalisation — PRD-123.
 *
 * Wraps the conversion-service `resolveCanonicalQty` so PRD-116's compile
 * has a single helper to call per ingredient line. The fallback contract
 * (unresolved → ingredient's `default_unit`) is implemented here so the
 * compile pipeline doesn't need to know about the resolution algorithm.
 *
 * v1 (PRD-116) was identity carry-over only; this module replaces that
 * shape. Anything that previously called `carryOverMetric` should now
 * call `normaliseLineQty`.
 */
import { conversionsService } from '@pops/app-food-db';

const { resolveCanonicalQty } = conversionsService;

import type { CanonicalUnit, FoodDb } from '@pops/app-food-db';

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
