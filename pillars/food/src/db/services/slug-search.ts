/**
 * Substring match against `slug_registry`, returning the target row's
 * display name where available. Empty query returns nothing.
 */
import { and, eq, inArray, like } from 'drizzle-orm';

import { ingredients, prepStates, recipes, slugRegistry, type SlugRegistryRow } from '../schema.js';

import type { FoodDb } from './internal.js';

export type SlugKind = 'ingredient' | 'recipe' | 'prep_state';

export interface SlugMatch {
  slug: string;
  kind: SlugKind;
  targetId: number;
  /** Display name resolved from the target row. Empty string if the
   *  underlying row was deleted out-of-band (orphan registry entry). */
  name: string;
}

export interface SearchSlugsInput {
  query: string;
  kinds?: readonly SlugKind[];
  limit?: number;
}

const DEFAULT_LIMIT = 25;
const KINDS_ALL: readonly SlugKind[] = ['ingredient', 'recipe', 'prep_state'];

export function searchSlugs(db: FoodDb, input: SearchSlugsInput): SlugMatch[] {
  if (input.query.length === 0) return [];
  const kinds = input.kinds ?? KINDS_ALL;
  if (kinds.length === 0) return [];
  const limit = input.limit ?? DEFAULT_LIMIT;
  const registryRows = db
    .select()
    .from(slugRegistry)
    .where(and(like(slugRegistry.slug, `%${input.query}%`), inArray(slugRegistry.kind, [...kinds])))
    .limit(limit)
    .all();
  return registryRows.map((row) => resolveMatch(db, row));
}

function resolveMatch(db: FoodDb, row: SlugRegistryRow): SlugMatch {
  return {
    slug: row.slug,
    kind: row.kind as SlugKind,
    targetId: row.targetId,
    name: resolveDisplayName(db, row.kind as SlugKind, row.targetId),
  };
}

function resolveDisplayName(db: FoodDb, kind: SlugKind, targetId: number): string {
  if (kind === 'ingredient') {
    const r = db
      .select({ name: ingredients.name })
      .from(ingredients)
      .where(eq(ingredients.id, targetId))
      .all();
    return r[0]?.name ?? '';
  }
  if (kind === 'recipe') {
    const r = db.select({ slug: recipes.slug }).from(recipes).where(eq(recipes.id, targetId)).all();
    return r[0]?.slug ?? '';
  }
  const r = db
    .select({ name: prepStates.name })
    .from(prepStates)
    .where(eq(prepStates.id, targetId))
    .all();
  return r[0]?.name ?? '';
}
