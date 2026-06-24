/**
 * Wire shapes for `food.recipes.prepareSendToList` + `food.recipes.sendToList`.
 */
export interface PreviewItem {
  /** Human-readable label combining qty + unit + ingredient + variant + prep. */
  label: string;
  /** Canonical qty after aggregation + scale; null for unconverted rows. */
  qty: number | null;
  /** 'g' | 'ml' | 'count' for canonical rows; original unit for unconverted. */
  unit: string | null;
  ingredientId: number;
  variantId: number | null;
  /** Distinct prep slugs aggregated into this row (canonical) or this line (unconverted). */
  prepStateLabel: string | null;
  /** `recipe_lines.id` values that aggregated into this preview row. */
  sourceLineIds: number[];
}

export interface SendPreview {
  recipeTitle: string;
  scaleFactor: number;
  /** Grouped by `(ingredient_id, variant_id, canonical_unit)`, summed × scale. */
  canonicalItems: PreviewItem[];
  /** One row per recipe_line where `qty_g`/`qty_ml`/`qty_count` are all null. */
  unconvertedItems: PreviewItem[];
  /** Shopping-list IDs whose `notes` mention this recipe (soft warning only). */
  alreadySentToListIds: number[];
}

export type SendToListError =
  | 'RecipeNotFound'
  | 'NoIngredients'
  | 'TargetListNotFound'
  | 'TargetListArchived'
  | 'TargetListNotShopping'
  | 'NameRequiredForNew'
  | 'CompileNotReady';

export type SendTarget = { kind: 'existing'; listId: number } | { kind: 'new'; name: string };

export type SendToListResult =
  | { ok: true; listId: number; addedCount: number; mergedCount: number }
  | { ok: false; reason: SendToListError };

/**
 * Internal shape used inside the aggregator — keeps `prepState` distinct slugs
 * as a Set so the merger can collect across multiple lines, then collapsed
 * to a sorted joined string when the PreviewItem is finalised.
 */
export interface AggregatedCanonical {
  ingredientId: number;
  variantId: number | null;
  canonicalUnit: 'g' | 'ml' | 'count';
  qtySum: number;
  ingredientName: string;
  variantName: string | null;
  prepSlugs: Set<string>;
  sourceLineIds: number[];
}
