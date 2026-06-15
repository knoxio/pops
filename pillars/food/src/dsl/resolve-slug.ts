/**
 * Read-only slug-registry lookups. Every lookup is by primary key or an
 * indexed compound key, so resolution stays fast even on a thousand-line
 * recipe.
 */
import { and, eq } from 'drizzle-orm';

import {
  ingredientVariants,
  ingredients,
  prepStates,
  recipeVersions,
  recipes,
  slugRegistry,
} from '../db/schema.js';

import type { FoodDb } from '../db/services/internal.js';

export interface SlugEntry {
  slug: string;
  kind: 'ingredient' | 'recipe' | 'prep_state';
  targetId: number;
}

/** Look up a slug in `slug_registry`. */
export function lookupSlug(db: FoodDb, slug: string): SlugEntry | null {
  const rows = db
    .select({ slug: slugRegistry.slug, kind: slugRegistry.kind, targetId: slugRegistry.targetId })
    .from(slugRegistry)
    .where(eq(slugRegistry.slug, slug))
    .all();
  const row = rows[0];
  if (row === undefined) return null;
  return row as SlugEntry;
}

/** Look up an ingredient variant by `(ingredientId, slug)`. */
export function lookupVariant(
  db: FoodDb,
  ingredientId: number,
  slug: string
): { id: number } | null {
  const rows = db
    .select({ id: ingredientVariants.id })
    .from(ingredientVariants)
    .where(
      and(eq(ingredientVariants.ingredientId, ingredientId), eq(ingredientVariants.slug, slug))
    )
    .all();
  const row = rows[0];
  if (row === undefined) return null;
  return row;
}

/** Look up an ingredient by id (for slug-derived ingredient → variant lookups). */
export function lookupIngredient(
  db: FoodDb,
  ingredientId: number
): { id: number; slug: string } | null {
  const rows = db
    .select({ id: ingredients.id, slug: ingredients.slug })
    .from(ingredients)
    .where(eq(ingredients.id, ingredientId))
    .all();
  return rows[0] ?? null;
}

/** Look up a prep_state by id. */
export function lookupPrepState(db: FoodDb, prepStateId: number): { id: number } | null {
  const rows = db
    .select({ id: prepStates.id })
    .from(prepStates)
    .where(eq(prepStates.id, prepStateId))
    .all();
  return rows[0] ?? null;
}

export interface ResolvedRecipeYield {
  currentVersionId: number | null;
  yieldIngredientId: number | null;
  yieldVariantId: number | null;
  yieldPrepStateId: number | null;
}

/**
 * Resolve a recipe's current yield. Returns null if the recipe row is gone
 * (orphan slug_registry entry — defensive). Returns the recipe's
 * current_version_id and its yield columns.
 */
export function lookupRecipeYield(db: FoodDb, recipeId: number): ResolvedRecipeYield | null {
  const recRows = db
    .select({ id: recipes.id, currentVersionId: recipes.currentVersionId })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .all();
  const recipe = recRows[0];
  if (recipe === undefined) return null;
  if (recipe.currentVersionId === null) {
    return {
      currentVersionId: null,
      yieldIngredientId: null,
      yieldVariantId: null,
      yieldPrepStateId: null,
    };
  }
  const versionRows = db
    .select({
      yieldIngredientId: recipeVersions.yieldIngredientId,
      yieldVariantId: recipeVersions.yieldVariantId,
      yieldPrepStateId: recipeVersions.yieldPrepStateId,
    })
    .from(recipeVersions)
    .where(eq(recipeVersions.id, recipe.currentVersionId))
    .all();
  const version = versionRows[0];
  if (version === undefined) return null;
  return {
    currentVersionId: recipe.currentVersionId,
    yieldIngredientId: version.yieldIngredientId,
    yieldVariantId: version.yieldVariantId,
    yieldPrepStateId: version.yieldPrepStateId,
  };
}
