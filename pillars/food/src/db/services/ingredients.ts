/**
 * Application-side invariants:
 *   - slug shape: kebab-case `[a-z0-9]+(-[a-z0-9]+)*` (via `assertValidSlug`)
 *   - ingredient hierarchy depth ≤ 3 (counted at insert / re-parent)
 *   - ingredient parent chain forms no cycles (DFS at insert / re-parent)
 *   - slug_registry inserts throw `SlugAlreadyRegisteredError` (vs. the bare
 *     SQLite UNIQUE) so callers get the colliding kind in the error.
 */
import { eq } from 'drizzle-orm';

import { assertValidSlug } from '../../domain/slug.js';
import { SlugAlreadyRegisteredError, type SlugKind } from '../errors.js';
import { ingredients, slugRegistry, type IngredientRow } from '../schema.js';
import {
  assertParentChainValid,
  assertSlugAvailable,
  expectRow,
  type FoodDb,
  recordSlug,
  unregisterSlug,
} from './internal.js';

export type { FoodDb } from './internal.js';
export { MAX_INGREDIENT_DEPTH } from './internal.js';

export interface CreateIngredientInput {
  name: string;
  slug: string;
  defaultUnit: 'g' | 'ml' | 'count';
  parentId?: number | null;
  densityGPerMl?: number | null;
  notes?: string | null;
}

export function createIngredient(db: FoodDb, input: CreateIngredientInput): IngredientRow {
  assertValidSlug(input.slug);
  return db.transaction((tx) => {
    assertSlugAvailable(tx, input.slug);
    if (input.parentId != null) {
      assertParentChainValid(tx, input.parentId, null);
    }
    const inserted = tx
      .insert(ingredients)
      .values({
        name: input.name,
        slug: input.slug,
        defaultUnit: input.defaultUnit,
        parentId: input.parentId ?? null,
        densityGPerMl: input.densityGPerMl ?? null,
        notes: input.notes ?? null,
      })
      .returning()
      .all();
    const row = expectRow(inserted, 'createIngredient');
    recordSlug(tx, row.slug, 'ingredient', row.id);
    return row;
  });
}

export interface UpdateIngredientInput {
  name?: string;
  defaultUnit?: 'g' | 'ml' | 'count';
  densityGPerMl?: number | null;
  notes?: string | null;
}

export function updateIngredient(
  db: FoodDb,
  id: number,
  input: UpdateIngredientInput
): IngredientRow {
  const rows = db.update(ingredients).set(input).where(eq(ingredients.id, id)).returning().all();
  return expectRow(rows, `updateIngredient(${id})`);
}

export function renameIngredientSlug(db: FoodDb, oldSlug: string, newSlug: string): IngredientRow {
  assertValidSlug(newSlug);
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(eq(ingredients.slug, oldSlug))
      .all();
    const found = existing[0];
    if (found === undefined) {
      throw new Error(`Ingredient with slug "${oldSlug}" not found`);
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
      .update(ingredients)
      .set({ slug: newSlug })
      .where(eq(ingredients.id, found.id))
      .returning()
      .all();
    return expectRow(rows, `renameIngredientSlug(${oldSlug} → ${newSlug})`);
  });
}

export function changeIngredientParent(
  db: FoodDb,
  id: number,
  newParentId: number | null
): IngredientRow {
  return db.transaction((tx) => {
    if (newParentId != null) {
      assertParentChainValid(tx, newParentId, id);
    }
    const rows = tx
      .update(ingredients)
      .set({ parentId: newParentId })
      .where(eq(ingredients.id, id))
      .returning()
      .all();
    return expectRow(rows, `changeIngredientParent(${id})`);
  });
}

export function deleteIngredient(db: FoodDb, id: number): void {
  db.transaction((tx) => {
    const existing = tx
      .select({ slug: ingredients.slug })
      .from(ingredients)
      .where(eq(ingredients.id, id))
      .all();
    if (existing.length === 0) return;
    tx.delete(ingredients).where(eq(ingredients.id, id)).run();
    const row = expectRow(existing, `deleteIngredient(${id})`);
    unregisterSlug(tx, row.slug);
  });
}
