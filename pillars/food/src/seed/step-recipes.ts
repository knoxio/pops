/**
 * PRD-113 seed step — recipe headers + Phase-2 compile.
 *
 * `seedRecipeHeaders` is the Phase-1 path: it calls `createRecipe` for each
 * fixture and stashes both the recipe id and the first-version id in the
 * SeedContext. The DSL body lives in `recipe_versions.body_dsl` as plain
 * text; `compile_status` defaults to `'uncompiled'` and `status` to `'draft'`.
 *
 * `seedRecipesAndCompile` is the Phase-2 path: same create flow, plus a
 * caller-injected `compile` callback that drives PRD-116's
 * `compileRecipeVersion`, plus a `promoteVersion` call so each recipe's
 * `current_version_id` is set before the next fixture compiles. Order
 * matters — components (e.g. `smash-patty`) must be promoted before plates
 * that reference them via PRD-115's recipe-as-ingredient resolver.
 *
 * The callback indirection keeps `@pops/app-food-db` free of any dependency
 * on the React-bound `@pops/app-food` package. Production callers (the
 * `db:seed:food` CLI in `@pops/app-food`) supply the real
 * `compileRecipeVersion`; the in-memory test in this package falls back to
 * `seedRecipeHeaders` for Phase-1/3 coverage.
 *
 * Phase 3 wiring: if `seedIngestSources` already populated
 * `ctx.ingestSourceIdByRecipeSlug` for a given recipe slug, the matching
 * `ingest_sources.id` is passed through as `firstVersion.sourceId` so
 * PRD-135's `recipe_versions.source_id IS NOT NULL` scope sees the draft.
 */
import { promoteVersion } from '../db/services/recipe-versions.js';
import { createRecipe } from '../db/services/recipes.js';
import { RECIPE_FIXTURES, type RecipeFixture } from './data-recipes.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

/** Minimal compile callback contract. Structurally compatible with PRD-116's `CompileResult`. */
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
