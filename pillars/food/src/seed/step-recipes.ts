/**
 * Seed step — recipe headers + optional compile.
 *
 * `seedRecipeHeaders` calls `createRecipe` for each fixture and stashes both
 * the recipe id and the first-version id in the SeedContext. The DSL body
 * lives in `recipe_versions.body_dsl` as plain text; `compile_status`
 * defaults to `'uncompiled'` and `status` to `'draft'`.
 *
 * `seedRecipesAndCompile` uses the same create flow plus a caller-injected
 * `compile` callback (`compileRecipeVersion` from `../dsl/compile.js`) and a
 * `promoteVersion` call so each recipe's `current_version_id` is set before
 * the next fixture compiles. Order matters — components (e.g. `smash-patty`)
 * must be promoted before plates that reference them via the
 * recipe-as-ingredient resolver.
 *
 * The callback indirection keeps this seed module free of any dependency on
 * the DSL compile path, so the in-package vitest suite can run by falling
 * back to `seedRecipeHeaders`. The `mise run db:seed:food` runner
 * (`scripts/db-seed-food.ts`) supplies the real `compileRecipeVersion`.
 *
 * Ingest wiring: if `seedIngestSources` already populated
 * `ctx.ingestSourceIdByRecipeSlug` for a given recipe slug, the matching
 * `ingest_sources.id` is passed through as `firstVersion.sourceId` so the
 * `recipe_versions.source_id IS NOT NULL` review scope sees the draft.
 */
import { promoteVersion } from '../db/services/recipe-versions.js';
import { createRecipe } from '../db/services/recipes.js';
import { RECIPE_FIXTURES, type RecipeFixture } from './data-recipes.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

/** Minimal compile callback contract. Structurally compatible with the DSL `CompileResult`. */
export type SeedCompileResult =
  | { ok: true; lineCount: number; stepCount: number; creationCount: number }
  | { ok: false; phase: string; errors: readonly unknown[] };

export type SeedCompileFn = (versionId: number, db: FoodDb) => SeedCompileResult;

export interface RecipeStepCounts {
  recipes: number;
  recipeVersions: number;
}

export function seedRecipeHeaders(db: FoodDb, ctx: SeedContext): RecipeStepCounts {
  for (const fixture of RECIPE_FIXTURES) {
    createRecipeFromFixture(db, ctx, fixture);
  }
  return { recipes: RECIPE_FIXTURES.length, recipeVersions: RECIPE_FIXTURES.length };
}

export function seedRecipesAndCompile(
  db: FoodDb,
  ctx: SeedContext,
  compile: SeedCompileFn
): RecipeStepCounts {
  for (const fixture of RECIPE_FIXTURES) {
    const versionId = createRecipeFromFixture(db, ctx, fixture);
    const result = compile(versionId, db);
    if (!result.ok) {
      throw new Error(
        `seedRecipesAndCompile: recipe "${fixture.slug}" failed in phase "${result.phase}": ` +
          JSON.stringify(result.errors)
      );
    }
    promoteVersion(db, versionId);
  }
  return { recipes: RECIPE_FIXTURES.length, recipeVersions: RECIPE_FIXTURES.length };
}

function createRecipeFromFixture(db: FoodDb, ctx: SeedContext, fixture: RecipeFixture): number {
  const sourceId = ctx.ingestSourceIdByRecipeSlug.get(fixture.slug) ?? null;
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
      sourceId,
    },
  });
  ctx.recipeIdBySlug.set(result.recipe.slug, result.recipe.id);
  ctx.recipeVersionIdByRecipeSlug.set(result.recipe.slug, result.version.id);
  return result.version.id;
}
