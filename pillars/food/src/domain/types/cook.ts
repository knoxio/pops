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

import type { ConsumptionNeed, Shortfall } from '../../db/services/batches.js';
import type { LineConsumeNeed } from './batches.js';

export type { ConsumptionNeed, Shortfall };

/**
 * Pre-flight data for the cook modal. Returned by `food.cook.prepareCook`.
 * The modal renders this once on open; the consume-preview panel multiplies
 * `consumeNeeds[].qty` by `scaleFactor` client-side as the user adjusts it.
 *
 * `consumeNeeds` carries the enriched PRD-146 `LineConsumeNeed` shape
 * (lineIndex + names + optional flag) so the modal can render the
 * consume preview + shortfall list without a second round-trip.
 */
export interface CookPreparation {
  recipeTitle: string;
  recipeSlug: string;
  versionNo: number;
  defaultScaleFactor: number;
  yieldsBatch: boolean;
  yieldDefault: CookYieldDefault | null;
  consumeNeeds: readonly LineConsumeNeed[];
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
      /**
       * PRD-149 — set when the override came from a substitution pick in
       * `BatchOverridePicker`'s Substitutions section. Server validates
       * the edge exists and resolves to the chosen batch's variant; on
       * success appends a substitution audit line to `recipe_runs.notes`.
       */
      substitutionEdgeId?: number;
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
      /** PRD-149 — see `batch-override` variant. */
      substitutionEdgeId?: number;
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
  | 'ShortfallUnresolved'
  | 'SubstitutionEdgeInvalid';

export type MarkCookedResult =
  | { ok: true; recipeRunId: number; yieldedBatchId: number | null }
  | { ok: false; reason: MarkCookedError; shortfalls?: readonly Shortfall[] };
