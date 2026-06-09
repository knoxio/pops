import { and, asc, eq, inArray, like, or, sql } from 'drizzle-orm';

import {
  ingredientAliases,
  ingredients,
  ingredientVariants,
  recipeLines,
  recipes,
  recipeVersions,
  type IngredientRow,
  type IngredientVariantRow,
} from '../schema.js';

import type { FoodDb } from './internal.js';

export interface ListIngredientsInput {
  search?: string;
  parentId?: number | null;
}

export function listIngredients(db: FoodDb, input: ListIngredientsInput = {}): IngredientRow[] {
  const filters = [];
  if (input.search !== undefined && input.search.length > 0) {
    filters.push(
      or(like(ingredients.name, `%${input.search}%`), like(ingredients.slug, `%${input.search}%`))
    );
  }
  if (input.parentId === null) {
    filters.push(sql`${ingredients.parentId} IS NULL`);
  } else if (input.parentId !== undefined) {
    filters.push(eq(ingredients.parentId, input.parentId));
  }
  const q = db.select().from(ingredients);
  return filters.length > 0 ? q.where(and(...filters)).all() : q.all();
}

export function getIngredient(db: FoodDb, id: number): IngredientRow | null {
  const rows = db.select().from(ingredients).where(eq(ingredients.id, id)).all();
  return rows[0] ?? null;
}

export function getIngredientBySlug(db: FoodDb, slug: string): IngredientRow | null {
  const rows = db.select().from(ingredients).where(eq(ingredients.slug, slug)).all();
  return rows[0] ?? null;
}

export function listVariantsForIngredient(
  db: FoodDb,
  ingredientId: number
): IngredientVariantRow[] {
  return db
    .select()
    .from(ingredientVariants)
    .where(eq(ingredientVariants.ingredientId, ingredientId))
    .all();
}

export interface DeleteBlockerSummary {
  variants: number;
  aliases: number;
}

/**
 * Count the rows that would block a delete of this ingredient. Rows checked
 * here are the ones backed by an actual FK with `ON DELETE NO ACTION`
 * (variants, aliases). Recipe-line / batch / substitution blockers can be
 * computed by their own services and merged at the API router.
 */
export function getIngredientDeleteBlockers(
  db: FoodDb,
  ingredientId: number
): DeleteBlockerSummary {
  const variants = db
    .select({ id: ingredientVariants.id })
    .from(ingredientVariants)
    .where(eq(ingredientVariants.ingredientId, ingredientId))
    .all();
  const aliases = db
    .select({ id: ingredientAliases.id })
    .from(ingredientAliases)
    .where(eq(ingredientAliases.ingredientId, ingredientId))
    .all();
  return { variants: variants.length, aliases: aliases.length };
}

export interface RecipeRefRow {
  recipeId: number;
  recipeSlug: string;
  recipeTitle: string;
}

export interface RecipeRefsSummary {
  count: number;
  recipes: RecipeRefRow[];
}

/**
 * Recipes that reference this ingredient via at least one compiled
 * `recipe_lines` row. Deduped per recipe (a recipe with five lines using the
 * same ingredient counts once). Title is sourced from the recipe's
 * `current_version` when one exists, falling back to the most-recent
 * `recipe_versions` row so freshly-imported drafts still display a name.
 *
 * Uncompiled recipes do not appear — `recipe_lines` is only populated by
 * PRD-116's compile pass. That's the same behaviour the auto-create deep-link
 * relies on, and means the count tracks the curated DSL graph rather than
 * the raw draft body.
 */
export function getRecipeRefsForIngredient(db: FoodDb, ingredientId: number): RecipeRefsSummary {
  const distinctRecipeIds = db
    .selectDistinct({ recipeId: recipeVersions.recipeId })
    .from(recipeLines)
    .innerJoin(recipeVersions, eq(recipeLines.recipeVersionId, recipeVersions.id))
    .where(eq(recipeLines.ingredientId, ingredientId))
    .all()
    .map((row) => row.recipeId);
  if (distinctRecipeIds.length === 0) return { count: 0, recipes: [] };
  const recipeRows = db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      currentVersionId: recipes.currentVersionId,
    })
    .from(recipes)
    .where(inArray(recipes.id, distinctRecipeIds))
    .orderBy(asc(recipes.slug))
    .all();
  const titleByRecipeId = collectRecipeTitles(db, distinctRecipeIds);
  const items: RecipeRefRow[] = recipeRows.map((row) => ({
    recipeId: row.id,
    recipeSlug: row.slug,
    recipeTitle: titleByRecipeId.get(row.id) ?? row.slug,
  }));
  return { count: items.length, recipes: items };
}

function collectRecipeTitles(db: FoodDb, recipeIds: number[]): Map<number, string> {
  const rows = db
    .select({
      recipeId: recipeVersions.recipeId,
      versionId: recipeVersions.id,
      versionNo: recipeVersions.versionNo,
      title: recipeVersions.title,
    })
    .from(recipeVersions)
    .where(inArray(recipeVersions.recipeId, recipeIds))
    .all();
  const currentByRecipe = new Map<number, number>();
  const currentTitle = new Map<number, string>();
  const fallbackTitle = new Map<number, { versionNo: number; title: string }>();
  const currentVersionRows = db
    .select({ id: recipes.id, currentVersionId: recipes.currentVersionId })
    .from(recipes)
    .where(inArray(recipes.id, recipeIds))
    .all();
  for (const row of currentVersionRows) {
    if (row.currentVersionId !== null) currentByRecipe.set(row.id, row.currentVersionId);
  }
  for (const row of rows) {
    if (currentByRecipe.get(row.recipeId) === row.versionId) {
      currentTitle.set(row.recipeId, row.title);
      continue;
    }
    const prev = fallbackTitle.get(row.recipeId);
    if (prev === undefined || row.versionNo > prev.versionNo) {
      fallbackTitle.set(row.recipeId, { versionNo: row.versionNo, title: row.title });
    }
  }
  const merged = new Map<number, string>();
  for (const id of recipeIds) {
    const title = currentTitle.get(id) ?? fallbackTitle.get(id)?.title;
    if (title !== undefined) merged.set(id, title);
  }
  return merged;
}
