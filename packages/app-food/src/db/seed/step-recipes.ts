/**
 * PRD-113 seed step — recipe headers (phase 1).
 *
 * Calls `createRecipe` for each fixture and stashes both the recipe id and
 * the first-version id in the SeedContext. The DSL body lives in
 * `recipe_versions.body_dsl` as plain text; `compile_state` defaults to
 * uncompiled and `status` to draft.
 *
 * Phase 2 (post PRD-116) replaces this step with one that calls
 * `compileRecipeVersion` so the DSL → resolve → cycle → materialise path
 * runs against real fixtures.
 */
import { createRecipe } from '../services/recipes';
import { RECIPE_FIXTURES } from './data-recipes';

import type { FoodDb } from '../services/internal';
import type { SeedContext } from './types';

export function seedRecipeHeaders(
  db: FoodDb,
  ctx: SeedContext
): { recipes: number; recipeVersions: number } {
  for (const fixture of RECIPE_FIXTURES) {
    const result = createRecipe(db, {
      slug: fixture.slug,
      recipeType: fixture.recipeType ?? 'plate',
      firstVersion: {
        title: fixture.title,
        bodyDsl: fixture.bodyDsl,
        summary: fixture.summary ?? null,
        servings: fixture.servings ?? null,
        prepMinutes: fixture.prepMinutes ?? null,
        cookMinutes: fixture.cookMinutes ?? null,
      },
    });
    ctx.recipeIdBySlug.set(result.recipe.slug, result.recipe.id);
    ctx.recipeVersionIdByRecipeSlug.set(result.recipe.slug, result.version.id);
  }
  return { recipes: RECIPE_FIXTURES.length, recipeVersions: RECIPE_FIXTURES.length };
}
