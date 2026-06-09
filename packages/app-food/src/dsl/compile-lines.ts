/**
 * `recipe_lines` materialiser — PRD-116.
 *
 * Maps a `ResolvedIngredientBlock` + the author's original descriptor
 * string to an INSERT row. v1 conversion is the identity carry-over:
 * `original_unit ∈ {g,ml,count}` → the matching `qty_*` column gets the
 * value; otherwise all three stay null and `canonical_unit` falls back to
 * the ingredient's `default_unit` (the conversion-table PRD upgrades
 * this).
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
  canonicalUnit: 'g' | 'ml' | 'count';
  optional: number;
  notes: string | null;
}

export function buildLineInsert(args: {
  block: ResolvedIngredientBlock;
  recipeVersionId: number;
  originalText: string;
  ingredientDefaultUnit: 'g' | 'ml' | 'count';
}): LineInsert {
  const { block, recipeVersionId, originalText, ingredientDefaultUnit } = args;
  if (block.ingredientId === null) {
    throw new Error(
      `buildLineInsert: block index=${block.index} has null ingredientId — creations not applied`
    );
  }
  const canonical = carryOverMetric(block.qty, block.unit, ingredientDefaultUnit);
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
    qtyG: canonical.unit === 'g' ? canonical.qty : null,
    qtyMl: canonical.unit === 'ml' ? canonical.qty : null,
    qtyCount: canonical.unit === 'count' ? canonical.qty : null,
    canonicalUnit: canonical.unit,
    optional: block.optional ? 1 : 0,
    notes: block.notes,
  };
}

interface CanonicalQty {
  qty: number | null;
  unit: 'g' | 'ml' | 'count';
}

/** v1 identity carry-over. Unknown units fall through to the ingredient's default. */
export function carryOverMetric(
  qty: number,
  unit: string,
  fallback: 'g' | 'ml' | 'count'
): CanonicalQty {
  if (unit === 'g' || unit === 'ml' || unit === 'count') {
    return { qty, unit };
  }
  return { qty: null, unit: fallback };
}
