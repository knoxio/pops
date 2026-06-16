/**
 * Shared types for `substitutions-resolve` — PRD-150.
 *
 * Split out so the public service file and its SQL-loader sibling can
 * both import without a circular reference.
 */
export type SubstitutionScope = 'global' | 'recipe';

/** Bucket of pantry batches for one `(variantId, prepStateId|null)` key. */
export interface BatchInventoryEntry {
  /** Sum of `qty_remaining` across every non-deleted, non-empty batch. */
  totalQty: number;
  unit: 'g' | 'ml' | 'count';
}

/** Snapshot of every active batch indexed by `(variantId, prepStateId|null)`. */
export interface BatchInventory {
  byVariantPrep: ReadonlyMap<string, BatchInventoryEntry>;
}

export interface SubstitutionEdge {
  id: number;
  fromIngredientId: number | null;
  fromVariantId: number | null;
  toIngredientId: number | null;
  toVariantId: number | null;
  ratio: number;
  contextTags: readonly string[];
  scope: SubstitutionScope;
  recipeId: number | null;
  /** PRD-149 — edge notes rendered in the picker row tooltip. */
  notes: string | null;
}

/** Bulk-loaded edge index — global + per-recipe scoped. */
export interface SubstitutionsIndex {
  global: readonly SubstitutionEdge[];
  byRecipe: ReadonlyMap<number, readonly SubstitutionEdge[]>;
}

/** Inputs to the per-line resolver. */
export interface LineCtx {
  recipeId: number;
  ingredientId: number;
  variantId: number | null;
  recipeTags: readonly string[];
}

/** One candidate edge after override + context-tag filtering. */
export interface SubstitutionCandidate {
  edgeId: number;
  ratio: number;
  toIngredientId: number | null;
  toVariantId: number | null;
  scope: SubstitutionScope;
  /** PRD-149 — surfaced so the cook picker can render the edge's tags inline. */
  contextTags: readonly string[];
  /** PRD-149 — null for global-scoped edges, the owning recipe for recipe-scoped. */
  recipeId: number | null;
  /** PRD-149 — edge notes rendered in the picker row tooltip. */
  notes: string | null;
}
