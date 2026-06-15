import { eq } from 'drizzle-orm';

import { assertValidSlug } from '../../domain/slug.js';
import { SlugAlreadyRegisteredError, type SlugKind } from '../errors.js';
import {
  recipes,
  recipeVersions,
  slugRegistry,
  type RecipeRow,
  type RecipeVersionRow,
} from '../schema.js';
import {
  assertSlugAvailable,
  expectRow,
  type FoodDb,
  recordSlug,
  unregisterSlug,
} from './internal.js';
import { deleteRecipeScopedSubstitutions } from './substitutions.js';

export type RecipeType =
  | 'plate'
  | 'component'
  | 'technique'
  | 'sauce'
  | 'dressing'
  | 'drink'
  | 'condiment';

export interface CreateRecipeInput {
  slug: string;
  recipeType?: RecipeType;
  heroImagePath?: string | null;
  firstVersion: {
    title: string;
    bodyDsl: string;
    summary?: string | null;
    servings?: number | null;
    prepMinutes?: number | null;
    cookMinutes?: number | null;
    sourceId?: number | null;
  };
}

export interface CreateRecipeResult {
  recipe: RecipeRow;
  version: RecipeVersionRow;
}

export function createRecipe(db: FoodDb, input: CreateRecipeInput): CreateRecipeResult {
  assertValidSlug(input.slug);
  return db.transaction((tx) => {
    assertSlugAvailable(tx, input.slug);
    const recipeRows = tx
      .insert(recipes)
      .values({
        slug: input.slug,
        recipeType: input.recipeType ?? 'plate',
        heroImagePath: input.heroImagePath ?? null,
      })
      .returning()
      .all();
    const recipe = expectRow(recipeRows, 'createRecipe');
    const versionRows = tx
      .insert(recipeVersions)
      .values({
        recipeId: recipe.id,
        versionNo: 1,
        status: 'draft',
        title: input.firstVersion.title,
        summary: input.firstVersion.summary ?? null,
        bodyDsl: input.firstVersion.bodyDsl,
        servings: input.firstVersion.servings ?? null,
        prepMinutes: input.firstVersion.prepMinutes ?? null,
        cookMinutes: input.firstVersion.cookMinutes ?? null,
        sourceId: input.firstVersion.sourceId ?? null,
      })
      .returning()
      .all();
    const version = expectRow(versionRows, 'createRecipe.firstVersion');
    recordSlug(tx, recipe.slug, 'recipe', recipe.id);
    return { recipe, version };
  });
}

export function archiveRecipe(db: FoodDb, recipeId: number): RecipeRow {
  const rows = db
    .update(recipes)
    .set({ archivedAt: new Date().toISOString() })
    .where(eq(recipes.id, recipeId))
    .returning()
    .all();
  return expectRow(rows, `archiveRecipe(${recipeId})`);
}

export function renameRecipeSlug(db: FoodDb, oldSlug: string, newSlug: string): RecipeRow {
  assertValidSlug(newSlug);
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.slug, oldSlug))
      .all();
    const found = existing[0];
    if (found === undefined) {
      throw new Error(`Recipe with slug "${oldSlug}" not found`);
    }
    const conflict = tx
      .select({ kind: slugRegistry.kind })
      .from(slugRegistry)
      .where(eq(slugRegistry.slug, newSlug))
      .all();
    const collision = conflict[0];
    if (collision !== undefined) {
      throw new SlugAlreadyRegisteredError(newSlug, collision.kind as SlugKind);
    }
    tx.update(slugRegistry).set({ slug: newSlug }).where(eq(slugRegistry.slug, oldSlug)).run();
    const rows = tx
      .update(recipes)
      .set({ slug: newSlug })
      .where(eq(recipes.id, found.id))
      .returning()
      .all();
    return expectRow(rows, `renameRecipeSlug(${oldSlug} → ${newSlug})`);
  });
}

export function deleteRecipe(db: FoodDb, recipeId: number): void {
  db.transaction((tx) => {
    const existing = tx
      .select({ slug: recipes.slug })
      .from(recipes)
      .where(eq(recipes.id, recipeId))
      .all();
    if (existing.length === 0) return;
    deleteRecipeScopedSubstitutions(tx, recipeId);
    tx.delete(recipeVersions).where(eq(recipeVersions.recipeId, recipeId)).run();
    tx.delete(recipes).where(eq(recipes.id, recipeId)).run();
    const row = expectRow(existing, `deleteRecipe(${recipeId})`);
    unregisterSlug(tx, row.slug);
  });
}
