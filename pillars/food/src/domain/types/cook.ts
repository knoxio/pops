/**
 * Type contracts for the cook flow, shared between the contract/router
 * and the CookModal so wire shapes stay aligned.
 *
 * Re-exports `ConsumptionNeed` + `Shortfall` from `db/services/batches`
 * rather than redefining them.
 */

import type { ConsumptionNeed, Shortfall } from '../../db/services/batches.js';
import type { LineConsumeNeed } from './batches.js';

export type { ConsumptionNeed, Shortfall };

/**
 * Pre-flight data for the cook modal. The modal renders this once on
 * open; the consume-preview panel multiplies `consumeNeeds[].qty` by
 * `scaleFactor` client-side as the user adjusts it.
 *
 * `consumeNeeds` carries the enriched `LineConsumeNeed` shape (lineIndex
 * + names + optional flag) so the modal can render the consume preview
 * and shortfall list without a second round-trip.
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
 * Yield arguments supplied to the mark-cooked mutation when the recipe
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
 * Per-line consumption override supplied to the mark-cooked mutation by
 * the shortfall-resolution UI. Empty array on the happy path.
 *
 * `lineIndex` matches `recipe_lines.position` (1-based).
 */
export type ConsumptionOverride =
  | {
      lineIndex: number;
      kind: 'batch-override';
      batchId: number;
      consumeQty: number;
      unit: 'g' | 'ml' | 'count';
      /**
       * Set when the override came from a substitution pick in
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
      /** See the `batch-override` variant. */
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
