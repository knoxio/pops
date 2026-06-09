/**
 * Read-side helpers for the ingredients tab of the PRD-122 data page.
 *
 * Split from `./ingredients.ts` to keep that file under the per-file
 * line cap. Mutations and slug-registry maintenance stay in the parent
 * service; reads (list / get / variants / blocker enumeration) live here.
 */
import { and, eq, like, or, sql } from 'drizzle-orm';

import {
  ingredientAliases,
  ingredients,
  ingredientVariants,
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
