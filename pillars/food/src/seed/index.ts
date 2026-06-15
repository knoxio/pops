/**
 * PRD-113 phase 1 + 2 + 3 — food + lists seed entry point.
 *
 * Phase 1 shipped the non-compile fixture set (ingredients, variants, prep
 * states, aliases, substitutions, plan slots + entries, batches, recipe
 * headers with uncompiled DSL, lists + items). Phase 3 added two
 * `ingest_sources` rows so PRD-135's inbox inspector renders against real
 * provenance fixtures. Phase 2 closes the cross-PRD smoke test: when the
 * caller supplies a `compile` callback (production: PRD-116's
 * `compileRecipeVersion` from `@pops/app-food`), the recipe step parses →
 * resolves → cycle-checks → materialises each fixture and promotes v1 to
 * `current`. Phase 2 also seeds PRD-123's `unit_conversions` and
 * `ingredient_weights` so the compile path's normalisation has rows to
 * resolve against.
 *
 * Order matters:
 *
 *   1. `seedIngestSources` inserts ingest_sources rows BEFORE recipes so
 *      `step-recipes` can pick up each source id and pass it as
 *      `recipe_versions.source_id`.
 *   2. `seedConversions` runs BEFORE the recipe step so PRD-116's compile
 *      normalisation can resolve qty:unit pairs like `cup` and `kg`.
 *   3. `seedRecipesAndCompile` (Phase 2) or `seedRecipeHeaders` (Phase 1
 *      fallback) creates each recipe; compile + promote run inline so
 *      later fixtures can reference earlier ones via recipe-as-ingredient.
 *   4. `linkIngestSourcesToDrafts` patches `ingest_sources.draft_recipe_id`
 *      to FK back to the freshly-created recipes.
 *
 * Idempotency: the seed early-returns when the `slug_registry` already has
 * rows. Re-running over a populated DB is a no-op (re-runs after a wipe
 * insert again). Mixing seeded + non-seeded rows in `slug_registry` is not
 * a supported state; callers wipe first.
 *
 * The food schemas and the lists schema share the same SQLite handle but
 * each owns a typed Drizzle wrapper. The seed accepts the food wrapper and
 * a lists wrapper (typically constructed from the same raw DB).
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
   * When provided, recipes are compiled via PRD-116 and v1 is promoted to
   * `current`. When omitted, recipes land as uncompiled drafts (Phase 1
   * behaviour — used by the in-package vitest suite that can't import the
   * React-bound `@pops/app-food` package).
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
 * Run the PRD-113 seed.
 *
 * @param foodDb Drizzle wrapper over the food pillar's SQLite handle.
 * @param options Optional `compileRecipeVersion` for Phase-2 compile + promote.
 * @returns Row counts per table; `skipped=true` when the slug_registry was
 *   non-empty and the seed early-returned.
 *
 * Note: lists + list-items fixtures were dropped during the food pillar
 * collapse (food no longer reaches into the lists pillar's DB). Lists
 * are seeded via their own public surface in a follow-up.
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
