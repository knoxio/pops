/**
 * Cross-PRD type contracts for the fridge view (PRD-147).
 *
 * Owned by PRD-147. The tRPC router in pops-api and the
 * `FridgePage` + sub-components in @pops/app-food share these wire
 * shapes.
 */

import type { BatchLocation, BatchSourceType, BatchUnit } from './batches.js';

export interface FridgeBatchRow {
  id: number;
  variantName: string | null;
  variantSlug: string | null;
  prepStateLabel: string | null;
  qtyRemaining: number;
  unit: BatchUnit;
  expiresAt: string | null;
  daysToExpiry: number | null;
  producedAt: string;
  sourceType: BatchSourceType;
  sourceRecipeSlug: string | null;
  notes: string | null;
  deletedAt: string | null;
}

export interface FridgeIngredientGroup {
  ingredientId: number;
  ingredientName: string;
  ingredientSlug: string;
  batches: readonly FridgeBatchRow[];
}

export interface FridgeLocationSection {
  location: BatchLocation;
  count: number;
  ingredients: readonly FridgeIngredientGroup[];
}

export interface FridgeViewCounts {
  visible: number;
  empty: number;
  deleted: number;
}

export interface FridgeView {
  sections: readonly FridgeLocationSection[];
  counts: FridgeViewCounts;
}

export interface RecipeForCookRow {
  recipeId: number;
  recipeSlug: string;
  title: string;
  recipeType: string | null;
  lineCount: number;
  recipeNeedsQty: number | null;
  lastCookedAt: string | null;
}
