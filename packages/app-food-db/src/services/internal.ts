import { eq } from 'drizzle-orm';

import {
  IngredientCycleError,
  IngredientHierarchyDepthExceeded,
  SlugAlreadyRegisteredError,
  type SlugKind,
} from '../errors.js';
import { ingredients, slugRegistry } from '../schema.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A drizzle handle — either the top-level db or a transaction. */
export type FoodDb = BetterSQLite3Database<Record<string, unknown>>;

/** Cap on the hierarchical depth of `ingredients.parent_id` chains. */
export const MAX_INGREDIENT_DEPTH = 3;

/**
 * Extract the row from an `.insert(...).returning().all()` or equivalent
 * mutation that's guaranteed to produce at least one result. Throws with a
 * pointed message if it didn't — that indicates a logic error in the caller
 * (e.g. updating a row id that doesn't exist) rather than a normal flow.
 */
export function expectRow<T>(rows: readonly T[], label: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${label}: expected a row but got none`);
  }
  return row;
}

/**
 * Throw if the slug is already in the registry under any kind. Read-only —
 * call before inserting the parent row so the typed `SlugAlreadyRegisteredError`
 * fires before SQLite's bare UNIQUE error.
 */
export function assertSlugAvailable(db: FoodDb, slug: string): void {
  const existing = db
    .select({ kind: slugRegistry.kind })
    .from(slugRegistry)
    .where(eq(slugRegistry.slug, slug))
    .all();
  const collision = existing[0];
  if (collision !== undefined) {
    throw new SlugAlreadyRegisteredError(slug, collision.kind as SlugKind);
  }
}

/** Insert the registry row. Call AFTER inserting the parent. */
export function recordSlug(db: FoodDb, slug: string, kind: SlugKind, targetId: number): void {
  db.insert(slugRegistry).values({ slug, kind, targetId }).run();
}

export function unregisterSlug(db: FoodDb, slug: string): void {
  db.delete(slugRegistry).where(eq(slugRegistry.slug, slug)).run();
}

/**
 * Walk the parent chain from `parentId` upward, asserting:
 *   - the chain doesn't contain `selfId` (cycle)
 *   - the chain depth ≤ MAX_INGREDIENT_DEPTH - 1 (the new node adds one)
 *
 * `selfId` is null for inserts; non-null for re-parent operations.
 */
export function assertParentChainValid(db: FoodDb, parentId: number, selfId: number | null): void {
  let cursor: number | null = parentId;
  let depth = 1; // counting the proposed new node
  while (cursor !== null) {
    if (selfId !== null && cursor === selfId) {
      throw new IngredientCycleError(selfId, parentId);
    }
    depth += 1;
    if (depth > MAX_INGREDIENT_DEPTH) {
      throw new IngredientHierarchyDepthExceeded(parentId, depth);
    }
    const next = db
      .select({ parentId: ingredients.parentId })
      .from(ingredients)
      .where(eq(ingredients.id, cursor))
      .all();
    cursor = next[0]?.parentId ?? null;
  }
}
