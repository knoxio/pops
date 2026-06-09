import { normaliseLineQty } from './normalisation';

import type { CanonicalUnit, FoodDb } from '@pops/app-food-db';
/**
 * `recipe_lines` materialiser. Maps a `ResolvedIngredientBlock` plus the
 * author's original descriptor string to an INSERT row. The normalisation
 * step is delegated to `normaliseLineQty` (3-step lookup in
 * `unit_conversions` and `ingredient_weights`).
 */

import type { ResolvedIngredientBlock } from './resolver-types';

export interface LineInsert {
  recipeVersionId: number;
  position: number;
  ingredientId: number;
  variantId: number | null;
  prepStateId: number | null;
  isRecipeRef: number;
  recipeRefId: number | null;
  originalText: string;
  originalQty: number;
  originalUnit: string;
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: CanonicalUnit;
  optional: number;
  notes: string | null;
}

export function buildLineInsert(args: {
  block: ResolvedIngredientBlock;
  recipeVersionId: number;
  originalText: string;
  ingredientDefaultUnit: CanonicalUnit;
  db: FoodDb;
}): LineInsert {
  const { block, recipeVersionId, originalText, ingredientDefaultUnit, db } = args;
  if (block.ingredientId === null) {
    throw new Error(
      `buildLineInsert: block index=${block.index} has null ingredientId — creations not applied`
    );
  }
  const canonical = normaliseLineQty(db, {
    ingredientId: block.ingredientId,
    variantId: block.variantId,
    unit: block.unit,
    qty: block.qty,
    ingredientDefaultUnit,
  });
  return {
    recipeVersionId,
    position: block.index,
    ingredientId: block.ingredientId,
    variantId: block.variantId,
    prepStateId: block.prepStateId,
    isRecipeRef: block.isRecipeRef ? 1 : 0,
    recipeRefId: block.recipeRef,
    originalText,
    originalQty: block.qty,
    originalUnit: block.unit,
    qtyG: canonical.qtyG,
    qtyMl: canonical.qtyMl,
    qtyCount: canonical.qtyCount,
    canonicalUnit: canonical.canonicalUnit,
    optional: block.optional ? 1 : 0,
    notes: block.notes,
  };
}
