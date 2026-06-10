/**
 * Cross-PRD type contracts for the cook flow (PRD-144).
 *
 * Owned by PRD-144. Re-exported through the package barrel so the tRPC
 * router in pops-api and the React CookModal in @pops/app-food can both
 * import without divergence.
 *
 * Imports `ConsumptionNeed` + `Shortfall` from PRD-108's existing
 * `services/batches.ts` to avoid duplicating types that already exist.
 */

import type { ConsumptionNeed, Shortfall } from '../services/batches.js';

export type { ConsumptionNeed, Shortfall };

/**
 * Pre-flight data for the cook modal. Returned by `food.cook.prepareCook`.
 * The modal renders this once on open; the consume-preview panel multiplies
 * `consumeNeeds[].qty` by `scaleFactor` client-side as the user adjusts it.
 */
export interface CookPreparation {
  recipeTitle: string;
  recipeSlug: string;
  versionNo: number;
  defaultScaleFactor: number;
  yieldsBatch: boolean;
  yieldDefault: CookYieldDefault | null;
  consumeNeeds: readonly ConsumptionNeed[];
  alreadyCooked: boolean;
}

export interface CookYieldDefault {
  qty: number;
  unit: 'g' | 'ml' | 'count';
  variantName: string | null;
  prepStateLabel: string | null;
  shelfLifeFridgeDays: number | null;
  shelfLifeFreezerDays: number | null;
}

/**
 * Yield arguments supplied to `food.cook.markCooked` when the recipe
 * produces a batch. Omitted for yieldless recipes.
 */
export interface CookYieldInput {
  qty: number;
  unit: 'g' | 'ml' | 'count';
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  expiresAt?: string;
  notes?: string;
}

/**
 * Per-line consumption override supplied to `food.cook.markCooked` by
 * PRD-146's shortfall-resolution UI. Empty array on the happy path.
 *
 * `lineIndex` matches `recipe_lines.position` (PRD-116, 1-based).
 */
export type ConsumptionOverride =
  | {
      lineIndex: number;
      kind: 'batch-override';
      batchId: number;
      consumeQty: number;
      unit: 'g' | 'ml' | 'count';
    }
  | {
      lineIndex: number;
      kind: 'external';
      externalQty: number;
      externalUnit: 'g' | 'ml' | 'count';
    }
  | {
      lineIndex: number;
      kind: 'partial';
      batchId: number;
      consumeQty: number;
      externalQty: number;
      unit: 'g' | 'ml' | 'count';
    };

export type MarkCookedError =
  | 'RecipeVersionNotFound'
  | 'RecipeNotCompiled'
  | 'PlanEntryNotFound'
  | 'PlanEntryAlreadyCooked'
  | 'YieldRequired'
  | 'YieldForbidden'
  | 'BadScaleFactor'
  | 'BadYieldQty'
  | 'BadRating'
  | 'BadExpiry'
  | 'ShortfallUnresolved';

export type MarkCookedResult =
  | { ok: true; recipeRunId: number; yieldedBatchId: number | null }
  | { ok: false; reason: MarkCookedError; shortfalls?: readonly Shortfall[] };
