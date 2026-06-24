/**
 * Assemble `RecipeVersionWithCompiledData` — the input to the renderer.
 *
 * One round-trip per joined table (recipes / versions / lines+joins /
 * steps / tags / yield) so a 200-line recipe still renders in a single
 * request. Wire shape lives in `src/domain/recipe-renderer-types.ts` so
 * both this handler AND the React renderer import the same TypeScript type.
 */
import { and, asc, eq } from 'drizzle-orm';

import {
  ingredients,
  ingredientVariants,
  prepStates,
  recipeLines,
  recipes,
  recipeSteps,
  recipeTags,
  recipeVersions,
  type FoodDb,
  type RecipeRow,
  type RecipeVersionRow,
} from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';

import type {
  RecipeLineWithResolved,
  RecipeVersionWithCompiledData,
} from '../../../domain/recipe-renderer-types.js';

export function getForRendering(
  db: FoodDb,
  slug: string,
  versionNo: number | undefined
): RecipeVersionWithCompiledData {
  const recipeRow = db.select().from(recipes).where(eq(recipes.slug, slug)).all()[0];
  if (recipeRow === undefined) throw new NotFoundError('Recipe', slug);
  const version = pickVersion(db, recipeRow, versionNo);
  return {
    version,
    recipe: recipeRow,
    lines: hydrateLines(db, version.id),
    steps: db
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeVersionId, version.id))
      .orderBy(asc(recipeSteps.position))
      .all(),
    ...hydrateYield(db, version),
    tags: db
      .select({ tag: recipeTags.tag })
      .from(recipeTags)
      .where(eq(recipeTags.recipeId, recipeRow.id))
      .all()
      .map((r) => r.tag)
      .toSorted(),
  };
}

function pickVersion(
  db: FoodDb,
  recipe: RecipeRow,
  versionNo: number | undefined
): RecipeVersionRow {
  if (versionNo !== undefined) {
    const v = db
      .select()
      .from(recipeVersions)
      .where(and(eq(recipeVersions.recipeId, recipe.id), eq(recipeVersions.versionNo, versionNo)))
      .all()[0];
    if (v === undefined) {
      throw new NotFoundError('Recipe version', `${recipe.slug}#${versionNo}`);
    }
    return v;
  }
  if (recipe.currentVersionId === null) {
    throw new NotFoundError('Published recipe version', recipe.slug);
  }
  const v = db
    .select()
    .from(recipeVersions)
    .where(eq(recipeVersions.id, recipe.currentVersionId))
    .all()[0];
  if (v === undefined) {
    // Integrity violation (dangling current_version_id) — let it surface as
    // a 500 via the Express error pipeline rather than masking it.
    throw new Error('recipe.current_version_id points at a missing row');
  }
  return v;
}

interface YieldHydrated {
  yieldIngredient: RecipeVersionWithCompiledData['yieldIngredient'];
  yieldVariant: RecipeVersionWithCompiledData['yieldVariant'];
  yieldPrepState: RecipeVersionWithCompiledData['yieldPrepState'];
}

function hydrateYield(db: FoodDb, version: RecipeVersionRow): YieldHydrated {
  return {
    yieldIngredient:
      version.yieldIngredientId === null
        ? null
        : (db
            .select()
            .from(ingredients)
            .where(eq(ingredients.id, version.yieldIngredientId))
            .all()[0] ?? null),
    yieldVariant:
      version.yieldVariantId === null
        ? null
        : (db
            .select()
            .from(ingredientVariants)
            .where(eq(ingredientVariants.id, version.yieldVariantId))
            .all()[0] ?? null),
    yieldPrepState:
      version.yieldPrepStateId === null
        ? null
        : (db
            .select()
            .from(prepStates)
            .where(eq(prepStates.id, version.yieldPrepStateId))
            .all()[0] ?? null),
  };
}

function hydrateLines(db: FoodDb, versionId: number): RecipeLineWithResolved[] {
  // Self-joining `recipes` via `recipeRefId` is awkward in drizzle's
  // builder — we keep the columns we need from the line + the joined
  // ingredient / variant / prep_state / ref-recipe in one SELECT.
  const refRecipes = recipes;
  return db
    .select({
      // Line columns
      id: recipeLines.id,
      position: recipeLines.position,
      ingredientId: recipeLines.ingredientId,
      variantId: recipeLines.variantId,
      prepStateId: recipeLines.prepStateId,
      isRecipeRef: recipeLines.isRecipeRef,
      recipeRefId: recipeLines.recipeRefId,
      originalText: recipeLines.originalText,
      originalQty: recipeLines.originalQty,
      originalUnit: recipeLines.originalUnit,
      qtyG: recipeLines.qtyG,
      qtyMl: recipeLines.qtyMl,
      qtyCount: recipeLines.qtyCount,
      canonicalUnit: recipeLines.canonicalUnit,
      optional: recipeLines.optional,
      notes: recipeLines.notes,
      // Joined display fields
      ingredientName: ingredients.name,
      ingredientSlug: ingredients.slug,
      variantName: ingredientVariants.name,
      variantSlug: ingredientVariants.slug,
      prepStateName: prepStates.name,
      prepStateSlug: prepStates.slug,
      recipeRefSlug: refRecipes.slug,
      recipeRefTitle: recipeVersions.title,
    })
    .from(recipeLines)
    .leftJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
    .leftJoin(ingredientVariants, eq(ingredientVariants.id, recipeLines.variantId))
    .leftJoin(prepStates, eq(prepStates.id, recipeLines.prepStateId))
    .leftJoin(refRecipes, eq(refRecipes.id, recipeLines.recipeRefId))
    .leftJoin(recipeVersions, eq(recipeVersions.id, refRecipes.currentVersionId))
    .where(eq(recipeLines.recipeVersionId, versionId))
    .orderBy(asc(recipeLines.position))
    .all()
    .map((r) => ({
      ...r,
      isRecipeRef: Boolean(r.isRecipeRef),
      optional: Boolean(r.optional),
      ingredientName: r.ingredientName ?? '',
      ingredientSlug: r.ingredientSlug ?? '',
    }));
}
