/**
 * `food.batches.get` resolver — composes `BatchDetail` with joined
 * ingredient / variant / prep-state / recipe-slug names.
 *
 * Kept here (not in `../../../db/index.js`) because the join is
 * read-projection only — the service layer's mutations operate on the
 * batches table alone. Future fridge-view / picker queries that need
 * similar joins can promote this into the package if a second caller
 * appears.
 */
import { eq } from 'drizzle-orm';

import {
  batches,
  ingredients,
  ingredientVariants,
  prepStates,
  recipeRuns,
  recipes,
  recipeVersions,
  type FoodDb,
} from '../../../db/index.js';

import type { BatchDetail } from '../../../db/index.js';

export function getBatchDetail(db: FoodDb, id: number): BatchDetail | null {
  const rows = db
    .select({
      id: batches.id,
      variantId: batches.variantId,
      variantName: ingredientVariants.name,
      variantSlug: ingredientVariants.slug,
      ingredientId: ingredients.id,
      ingredientName: ingredients.name,
      ingredientSlug: ingredients.slug,
      prepStateId: batches.prepStateId,
      prepStateLabel: prepStates.name,
      qtyRemaining: batches.qtyRemaining,
      unit: batches.unit,
      sourceType: batches.sourceType,
      sourceId: batches.sourceId,
      location: batches.location,
      producedAt: batches.producedAt,
      expiresAt: batches.expiresAt,
      notes: batches.notes,
      deletedAt: batches.deletedAt,
      createdAt: batches.createdAt,
    })
    .from(batches)
    .innerJoin(ingredientVariants, eq(ingredientVariants.id, batches.variantId))
    .innerJoin(ingredients, eq(ingredients.id, ingredientVariants.ingredientId))
    .leftJoin(prepStates, eq(prepStates.id, batches.prepStateId))
    .where(eq(batches.id, id))
    .all();
  const row = rows[0];
  if (row === undefined) return null;

  const recipeInfo = row.sourceType === 'recipe_run' ? resolveRecipeRun(db, row.sourceId) : null;

  return {
    ...row,
    sourceRecipeRunId: row.sourceType === 'recipe_run' ? row.sourceId : null,
    sourceRecipeSlug: recipeInfo?.slug ?? null,
  };
}

function resolveRecipeRun(db: FoodDb, runId: number | null): { slug: string } | null {
  if (runId === null) return null;
  const rows = db
    .select({ slug: recipes.slug })
    .from(recipeRuns)
    .innerJoin(recipeVersions, eq(recipeVersions.id, recipeRuns.recipeVersionId))
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(eq(recipeRuns.id, runId))
    .all();
  return rows[0] ?? null;
}
