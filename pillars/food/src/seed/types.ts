/**
 * Shared types for the food seed.
 */
import type { FoodDb } from '../db/services/internal.js';

/** Per-table row counts every seed step contributes, rolled up by the orchestrator. */
export interface StepCounts {
  prepStates: number;
  ingredients: number;
  variants: number;
  aliases: number;
  substitutions: number;
  planSlots: number;
  planEntries: number;
  recipes: number;
  recipeVersions: number;
  batches: number;
  recipeRuns: number;
  batchConsumptions: number;
  ingestSources: number;
  unitConversions: number;
  ingredientWeights: number;
  ingredientTags: number;
}

/** Final summary returned by `seedFood`. */
export interface SeedFoodSummary extends StepCounts {
  /** Set when the seed early-returned because the slug_registry was non-empty. */
  skipped: boolean;
}

export const ZERO_COUNTS: StepCounts = {
  prepStates: 0,
  ingredients: 0,
  variants: 0,
  aliases: 0,
  substitutions: 0,
  planSlots: 0,
  planEntries: 0,
  recipes: 0,
  recipeVersions: 0,
  batches: 0,
  recipeRuns: 0,
  batchConsumptions: 0,
  ingestSources: 0,
  unitConversions: 0,
  ingredientWeights: 0,
  ingredientTags: 0,
};

/**
 * Resolved ids from upstream steps that downstream steps reference by slug.
 * Threaded through the pipeline so every step works in terms of slugs in
 * source and ids at insert time.
 */
export interface SeedContext {
  prepStateIdBySlug: Map<string, number>;
  ingredientIdBySlug: Map<string, number>;
  /** Compound key `<ingredient-slug>:<variant-slug>` → id. */
  variantIdByCompositeSlug: Map<string, number>;
  recipeIdBySlug: Map<string, number>;
  /** `<recipe-slug>` → version_no 1 row id (every recipe ships one draft version). */
  recipeVersionIdByRecipeSlug: Map<string, number>;
  /** `<recipe-slug>` → recipe_runs.id for the seeded cook run on smash-burger. */
  recipeRunIdByRecipeSlug: Map<string, number>;
  /** Slot slug → row (used by plan_entries inserts). */
  planSlotBySlug: Map<string, { slug: string; name: string }>;
  /**
   * `<recipe-slug>` → `ingest_sources.id`. Populated by
   * `seedIngestSources` BEFORE `step-recipes` runs so the recipe-version
   * insert can wire `source_id`. `linkIngestSourcesToDrafts` later reads
   * the same map plus `recipeIdBySlug` to patch `draft_recipe_id`.
   */
  ingestSourceIdByRecipeSlug: Map<string, number>;
}

export function freshContext(): SeedContext {
  return {
    prepStateIdBySlug: new Map(),
    ingredientIdBySlug: new Map(),
    variantIdByCompositeSlug: new Map(),
    recipeIdBySlug: new Map(),
    recipeVersionIdByRecipeSlug: new Map(),
    recipeRunIdByRecipeSlug: new Map(),
    planSlotBySlug: new Map(),
    ingestSourceIdByRecipeSlug: new Map(),
  };
}

export interface SeedDb {
  food: FoodDb;
}
