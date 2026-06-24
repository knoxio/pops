/**
 * Food seed entry point.
 *
 * When the caller supplies a `compile` callback, the recipe step parses →
 * resolves → cycle-checks → materialises each fixture and promotes v1 to
 * `current`; without it recipes land as uncompiled drafts.
 *
 * Order matters:
 *
 *   1. `seedIngestSources` inserts ingest_sources rows BEFORE recipes so
 *      `step-recipes` can pick up each source id and pass it as
 *      `recipe_versions.source_id`.
 *   2. `seedConversions` runs BEFORE the recipe step so the compile
 *      normalisation can resolve qty:unit pairs like `cup` and `kg`.
 *   3. `seedRecipesAndCompile` or `seedRecipeHeaders` creates each recipe;
 *      compile + promote run inline so later fixtures can reference earlier
 *      ones via recipe-as-ingredient.
 *   4. `linkIngestSourcesToDrafts` patches `ingest_sources.draft_recipe_id`
 *      to FK back to the freshly-created recipes.
 *
 * Idempotency: the seed early-returns when the `slug_registry` already has
 * rows. Re-running over a populated DB is a no-op (re-runs after a wipe
 * insert again). Mixing seeded + non-seeded rows in `slug_registry` is not
 * a supported state; callers wipe first.
 */
import { sql } from 'drizzle-orm';

import { slugRegistry } from '../db/schema.js';
import { seedAliases } from './step-aliases.js';
import { seedBatches } from './step-batches.js';
import { seedConversions } from './step-conversions.js';
import { linkIngestSourcesToDrafts, seedIngestSources } from './step-ingest-sources.js';
import { seedIngredientTags } from './step-ingredient-tags.js';
import { seedIngredientsAndVariants } from './step-ingredients.js';
import { seedPlan } from './step-plan.js';
import { seedPrepStates } from './step-prep-states.js';
import { type SeedCompileFn, seedRecipeHeaders, seedRecipesAndCompile } from './step-recipes.js';
import { seedSubstitutions } from './step-substitutions.js';
import { freshContext, type SeedFoodSummary, ZERO_COUNTS } from './types.js';

import type { FoodDb } from '../db/services/internal.js';

export type { SeedCompileFn, SeedCompileResult } from './step-recipes.js';
export type { SeedFoodSummary } from './types.js';

export interface SeedFoodOptions {
  /**
   * When provided, recipes are compiled and v1 is promoted to `current`.
   * When omitted, recipes land as uncompiled drafts — used by the in-package
   * vitest suite that can't import the React-bound app surface.
   */
  compileRecipeVersion?: SeedCompileFn;
}

function slugRegistryHasRows(db: FoodDb): boolean {
  const rows = db
    .select({ count: sql<number>`count(*)` })
    .from(slugRegistry)
    .all();
  const count = rows[0]?.count ?? 0;
  return count > 0;
}

/**
 * Run the food seed.
 *
 * @param foodDb Drizzle wrapper over the food pillar's SQLite handle.
 * @param options Optional `compileRecipeVersion` to compile + promote recipes.
 * @returns Row counts per table; `skipped=true` when the slug_registry was
 *   non-empty and the seed early-returned.
 */
export function seedFood(foodDb: FoodDb, options: SeedFoodOptions = {}): SeedFoodSummary {
  if (slugRegistryHasRows(foodDb)) {
    return { ...ZERO_COUNTS, skipped: true };
  }
  const ctx = freshContext();

  const prepStates = seedPrepStates(foodDb, ctx);
  const ingredientCounts = seedIngredientsAndVariants(foodDb, ctx);
  const ingredientTags = seedIngredientTags(foodDb, ctx);
  const aliases = seedAliases(foodDb, ctx);
  const conversionCounts = seedConversions(foodDb, ctx);
  const ingestSources = seedIngestSources(foodDb, ctx);
  const recipeCounts =
    options.compileRecipeVersion === undefined
      ? seedRecipeHeaders(foodDb, ctx)
      : seedRecipesAndCompile(foodDb, ctx, options.compileRecipeVersion);
  linkIngestSourcesToDrafts(foodDb, ctx);
  const substitutions = seedSubstitutions(foodDb, ctx);
  const planCounts = seedPlan(foodDb, ctx);
  const batchCounts = seedBatches(foodDb, ctx);

  return {
    skipped: false,
    prepStates,
    ingredients: ingredientCounts.ingredients,
    variants: ingredientCounts.variants,
    aliases,
    substitutions,
    planSlots: planCounts.planSlots,
    planEntries: planCounts.planEntries,
    recipes: recipeCounts.recipes,
    recipeVersions: recipeCounts.recipeVersions,
    batches: batchCounts.batches,
    recipeRuns: batchCounts.recipeRuns,
    batchConsumptions: batchCounts.batchConsumptions,
    ingestSources,
    unitConversions: conversionCounts.unitConversions,
    ingredientWeights: conversionCounts.ingredientWeights,
    ingredientTags,
  };
}
