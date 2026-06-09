import { and, eq, isNull } from 'drizzle-orm';

import { SeededRowProtected } from '../errors.js';
import { ingredientWeights, unitConversions } from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

import type { CanonicalUnit, IngredientWeightRow, UnitConversionRow } from '../schema.js';

export interface CreateUnitConversionInput {
  fromUnit: string;
  toUnit: CanonicalUnit;
  ratio: number;
  notes?: string;
  isSeeded?: boolean;
}

export function createUnitConversion(
  db: FoodDb,
  input: CreateUnitConversionInput
): UnitConversionRow {
  return expectRow(
    db
      .insert(unitConversions)
      .values({
        fromUnit: input.fromUnit,
        toUnit: input.toUnit,
        ratio: input.ratio,
        notes: input.notes ?? null,
        isSeeded: input.isSeeded === true ? 1 : 0,
      })
      .returning()
      .all(),
    'createUnitConversion'
  );
}

export function updateUnitConversion(
  db: FoodDb,
  id: number,
  patch: { ratio?: number; notes?: string | null }
): UnitConversionRow {
  return expectRow(
    db.update(unitConversions).set(patch).where(eq(unitConversions.id, id)).returning().all(),
    `updateUnitConversion(${id})`
  );
}

export function deleteUnitConversion(db: FoodDb, id: number): void {
  const row = db
    .select({ isSeeded: unitConversions.isSeeded })
    .from(unitConversions)
    .where(eq(unitConversions.id, id))
    .all()[0];
  if (row === undefined) return;
  if (row.isSeeded === 1) {
    throw new SeededRowProtected('unit_conversions', id);
  }
  db.delete(unitConversions).where(eq(unitConversions.id, id)).run();
}

export interface CreateIngredientWeightInput {
  ingredientId: number;
  variantId?: number | null;
  unit: string;
  grams: number;
  notes?: string;
  isSeeded?: boolean;
}

export function createIngredientWeight(
  db: FoodDb,
  input: CreateIngredientWeightInput
): IngredientWeightRow {
  return expectRow(
    db
      .insert(ingredientWeights)
      .values({
        ingredientId: input.ingredientId,
        variantId: input.variantId ?? null,
        unit: input.unit,
        grams: input.grams,
        notes: input.notes ?? null,
        isSeeded: input.isSeeded === true ? 1 : 0,
      })
      .returning()
      .all(),
    'createIngredientWeight'
  );
}

export function updateIngredientWeight(
  db: FoodDb,
  id: number,
  patch: { grams?: number; notes?: string | null }
): IngredientWeightRow {
  return expectRow(
    db.update(ingredientWeights).set(patch).where(eq(ingredientWeights.id, id)).returning().all(),
    `updateIngredientWeight(${id})`
  );
}

export function deleteIngredientWeight(db: FoodDb, id: number): void {
  const row = db
    .select({ isSeeded: ingredientWeights.isSeeded })
    .from(ingredientWeights)
    .where(eq(ingredientWeights.id, id))
    .all()[0];
  if (row === undefined) return;
  if (row.isSeeded === 1) {
    throw new SeededRowProtected('ingredient_weights', id);
  }
  db.delete(ingredientWeights).where(eq(ingredientWeights.id, id)).run();
}

export interface ResolveCanonicalInput {
  ingredientId: number;
  variantId: number | null;
  unit: string;
  qty: number;
}

export type ResolveCanonicalResult =
  | { kind: 'resolved'; canonicalUnit: CanonicalUnit; qty: number }
  | { kind: 'unresolved' };

/**
 * 3-step resolution:
 *
 * 1. **`ingredient_weights`** for `(ingredientId, variantId, unit)`, falling
 *    back to `(ingredientId, NULL, unit)`. Always converts to grams.
 * 2. **`unit_conversions`** for `(fromUnit, *)`. First match wins.
 * 3. **No match** → `{ kind: 'unresolved' }`; caller falls back to the
 *    ingredient's `default_unit` with null qty.
 *
 * Identity carry-over for `g`/`ml`/`count` is handled here so callers have
 * a single entry point.
 */
export function resolveCanonicalQty(
  db: FoodDb,
  input: ResolveCanonicalInput
): ResolveCanonicalResult {
  if (input.unit === 'g' || input.unit === 'ml' || input.unit === 'count') {
    return { kind: 'resolved', canonicalUnit: input.unit, qty: input.qty };
  }
  const weight = lookupIngredientWeight(db, input);
  if (weight !== null) {
    return { kind: 'resolved', canonicalUnit: 'g', qty: input.qty * weight };
  }
  const conv = lookupUnitConversion(db, input.unit);
  if (conv !== null) {
    return { kind: 'resolved', canonicalUnit: conv.toUnit, qty: input.qty * conv.ratio };
  }
  return { kind: 'unresolved' };
}

function lookupIngredientWeight(db: FoodDb, input: ResolveCanonicalInput): number | null {
  if (input.variantId !== null) {
    const exact = db
      .select({ grams: ingredientWeights.grams })
      .from(ingredientWeights)
      .where(
        and(
          eq(ingredientWeights.ingredientId, input.ingredientId),
          eq(ingredientWeights.variantId, input.variantId),
          eq(ingredientWeights.unit, input.unit)
        )
      )
      .all();
    if (exact[0] !== undefined) return exact[0].grams;
  }
  const fallback = db
    .select({ grams: ingredientWeights.grams })
    .from(ingredientWeights)
    .where(
      and(
        eq(ingredientWeights.ingredientId, input.ingredientId),
        isNull(ingredientWeights.variantId),
        eq(ingredientWeights.unit, input.unit)
      )
    )
    .all();
  return fallback[0]?.grams ?? null;
}

function lookupUnitConversion(
  db: FoodDb,
  fromUnit: string
): { toUnit: CanonicalUnit; ratio: number } | null {
  // Order by `id` so "first match" is deterministic when multiple rows
  // exist for the same `from_unit`.
  const rows = db
    .select({ toUnit: unitConversions.toUnit, ratio: unitConversions.ratio })
    .from(unitConversions)
    .where(eq(unitConversions.fromUnit, fromUnit))
    .orderBy(unitConversions.id)
    .limit(1)
    .all();
  if (rows[0] === undefined) return null;
  return { toUnit: rows[0].toUnit, ratio: rows[0].ratio };
}
