/**
 * PRD-113 phase 1 + 3 — food + lists seed entry point.
 *
 * Phase 1 shipped the non-compile fixture set (ingredients, variants, prep
 * states, aliases, substitutions, plan slots + entries, batches, recipe
 * headers with uncompiled DSL, lists + items). Phase 3 adds two
 * `ingest_sources` rows so PRD-135's inbox inspector renders against real
 * provenance fixtures. Phase 2 will replace the `seedRecipeHeaders` call
 * with a `seedRecipesAndCompile` step that invokes `compileRecipeVersion`
 * once PRD-116-driven smoke gets wired in.
 *
 * Order matters for phase-3 wiring:
 *
 *   1. `seedIngestSources` inserts ingest_sources rows BEFORE recipes so
 *      `seedRecipeHeaders` can pick up each source id and pass it as
 *      `recipe_versions.source_id`.
 *   2. `seedRecipeHeaders` creates the recipes (and stashes their ids).
 *   3. `linkIngestSourcesToDrafts` patches `ingest_sources.draft_recipe_id`
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

import { slugRegistry } from '../schema.js';
import { seedAliases } from './step-aliases.js';
import { seedBatches } from './step-batches.js';
import { linkIngestSourcesToDrafts, seedIngestSources } from './step-ingest-sources.js';
import { seedIngredientsAndVariants } from './step-ingredients.js';
import { seedLists } from './step-lists.js';
import { seedPlan } from './step-plan.js';
import { seedPrepStates } from './step-prep-states.js';
import { seedRecipeHeaders } from './step-recipes.js';
import { seedSubstitutions } from './step-substitutions.js';
import { freshContext, type SeedFoodSummary, ZERO_COUNTS } from './types.js';

import type { ListsDb } from '@pops/app-lists';

import type { FoodDb } from '../services/internal.js';

export type { SeedFoodSummary } from './types.js';

function slugRegistryHasRows(db: FoodDb): boolean {
  const rows = db
    .select({ count: sql<number>`count(*)` })
    .from(slugRegistry)
    .all();
  const count = rows[0]?.count ?? 0;
  return count > 0;
}

/**
 * Run the PRD-113 phase-1 seed.
 *
 * @param foodDb Drizzle wrapper over the SQLite handle (food domain).
 * @param listsDb Drizzle wrapper over the SAME handle (lists domain).
 * @returns Row counts per table; `skipped=true` when the slug_registry was
 *   non-empty and the seed early-returned.
 */
export function seedFood(foodDb: FoodDb, listsDb: ListsDb): SeedFoodSummary {
  if (slugRegistryHasRows(foodDb)) {
    return { ...ZERO_COUNTS, skipped: true };
  }
  const ctx = freshContext();

  const prepStates = seedPrepStates(foodDb, ctx);
  const ingredientCounts = seedIngredientsAndVariants(foodDb, ctx);
  const aliases = seedAliases(foodDb, ctx);
  const ingestSources = seedIngestSources(foodDb, ctx);
  const recipeCounts = seedRecipeHeaders(foodDb, ctx);
  linkIngestSourcesToDrafts(foodDb, ctx);
  const substitutions = seedSubstitutions(foodDb, ctx);
  const planCounts = seedPlan(foodDb, ctx);
  const batchCounts = seedBatches(foodDb, ctx);
  const listCounts = seedLists(listsDb, ctx, ctx);

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
    lists: listCounts.lists,
    listItems: listCounts.listItems,
    ingestSources,
  };
}
