/**
 * Wire shapes for `food.shopping.previewFromPlan` and
 * `food.shopping.generateFromPlan` — PRD-152.
 *
 * The preview is computed twice: once server-side for the picker page, and a
 * second time as the first step of `generateFromPlan` so the server never
 * trusts the client's view. Both share the same shape.
 */

export type CanonicalUnit = 'g' | 'ml' | 'count';

export interface GeneratorItem {
  ingredientId: number;
  ingredientName: string;
  variantId: number | null;
  variantName: string | null;
  /** Sum across plan entries in the range, in `canonicalUnit`, at scaled servings. */
  needQty: number;
  /** Sum of non-deleted, non-empty batches matching `(variant_id, unit)`. */
  pantryQty: number;
  /** `max(needQty - pantryQty, 0)`. */
  buyQty: number;
  canonicalUnit: CanonicalUnit;
  /**
   * True when the source `recipe_lines` row had all three canonical qty
   * fields null — PRD-116 couldn't compute a canonical qty even though it
   * set `canonical_unit` to the ingredient's default unit.
   */
  isUnconverted: boolean;
  /** For unconverted items: the original DSL qty. */
  originalQty: number | null;
  /** For unconverted items: the original DSL unit. */
  originalUnit: string | null;
  sourceLineIds: number[];
}

export interface GeneratorSection {
  /** `'store-section:produce'` etc.; null for the Other / Unconverted buckets. */
  sectionTag: string | null;
  /** Human-readable label (`'Produce'`, `'Other / Uncategorised'`, `'Unconverted'`). */
  sectionLabel: string;
  items: GeneratorItem[];
}

export interface GeneratorPreview {
  startDate: string;
  endDate: string;
  planEntryCount: number;
  /**
   * `recipe_id` of plan entries that resolved to no current version. The
   * preview UI shows "<N> entries skipped — recipe has no current version".
   */
  skippedPlanEntryCount: number;
  sections: GeneratorSection[];
  /**
   * Ingredients that landed in the Other bucket — emitted so the UI can wire
   * each row's [Tag it] link to PRD-122 without an extra round-trip.
   */
  uncategorisedIngredientIds: number[];
  /** Distinct recipe titles in range, ordered by first plan entry date — used by the default list-name and item-notes provenance string. */
  recipeTitles: string[];
}

export type GenerateError = 'BadDateRange' | 'NoPlanEntries' | 'ListNameEmpty' | 'BulkAddFailed';

export type GenerateResult =
  | { ok: true; listId: number; itemCount: number }
  | { ok: false; reason: GenerateError };
