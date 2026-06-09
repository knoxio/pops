/**
 * Read-side helpers for the aliases tab (PRD-122-C).
 *
 * `listAliasesWithTargets` is the denormalised view rendered by the
 * `/food/data/aliases` table. Resolving target labels per-row on the
 * client would mean either an N+1 lookup or a paged fetch of the full
 * ingredient + variant tables — both worse than the targeted IN-list
 * lookup this helper performs. SQLite optimises the lookup trivially
 * at the row counts the table will see.
 *
 * Lives alongside `aliases.ts` instead of inside it to keep both files
 * under the 200-line lint cap. The split mirrors PRD-106's
 * `ingredients` / `ingredients-queries` pattern.
 */
import { eq, inArray } from 'drizzle-orm';

import { ingredients, ingredientVariants } from '../schema.js';
import { listAliases, type ListAliasesInput } from './aliases.js';

import type { FoodDb } from './internal.js';

export interface AliasWithTargetRow {
  readonly alias: {
    readonly id: number;
    readonly alias: string;
    readonly source: 'user' | 'llm' | 'ingest';
    readonly createdAt: string;
  };
  readonly target:
    | { kind: 'ingredient'; id: number; slug: string; name: string }
    | {
        kind: 'variant';
        id: number;
        slug: string;
        name: string;
        parentIngredientSlug: string;
        parentIngredientName: string;
      };
}

interface VariantLookup {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly parentSlug: string;
  readonly parentName: string;
}

interface IngredientLookup {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

function loadIngredients(db: FoodDb, ids: readonly number[]): Map<number, IngredientLookup> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: ingredients.id, slug: ingredients.slug, name: ingredients.name })
    .from(ingredients)
    .where(inArray(ingredients.id, [...ids]))
    .all();
  return new Map(rows.map((r) => [r.id, r]));
}

function loadVariants(db: FoodDb, ids: readonly number[]): Map<number, VariantLookup> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({
      id: ingredientVariants.id,
      slug: ingredientVariants.slug,
      name: ingredientVariants.name,
      parentId: ingredientVariants.ingredientId,
      parentSlug: ingredients.slug,
      parentName: ingredients.name,
    })
    .from(ingredientVariants)
    .innerJoin(ingredients, eq(ingredientVariants.ingredientId, ingredients.id))
    .where(inArray(ingredientVariants.id, [...ids]))
    .all();
  return new Map(
    rows.map((r) => [
      r.id,
      { id: r.id, slug: r.slug, name: r.name, parentSlug: r.parentSlug, parentName: r.parentName },
    ])
  );
}

export function listAliasesWithTargets(
  db: FoodDb,
  input: ListAliasesInput = {}
): AliasWithTargetRow[] {
  const rows = listAliases(db, input);
  if (rows.length === 0) return [];
  // Dedupe the FK lists before the IN-lookup — many aliases can point at
  // the same ingredient or variant, and a duplicate-laden IN-list
  // bloats the SQL for no gain (Copilot review on PR #2724).
  const ingIds = new Set<number>();
  const varIds = new Set<number>();
  for (const row of rows) {
    if (row.ingredientId !== null) ingIds.add(row.ingredientId);
    if (row.variantId !== null) varIds.add(row.variantId);
  }
  const ingredientsById = loadIngredients(db, [...ingIds]);
  const variantsById = loadVariants(db, [...varIds]);
  return rows.flatMap((row): AliasWithTargetRow[] => {
    if (row.ingredientId !== null) {
      const ing = ingredientsById.get(row.ingredientId);
      if (ing === undefined) return [];
      return [
        {
          alias: {
            id: row.id,
            alias: row.alias,
            source: row.source as 'user' | 'llm' | 'ingest',
            createdAt: row.createdAt,
          },
          target: { kind: 'ingredient', id: ing.id, slug: ing.slug, name: ing.name },
        },
      ];
    }
    if (row.variantId !== null) {
      const variant = variantsById.get(row.variantId);
      if (variant === undefined) return [];
      return [
        {
          alias: {
            id: row.id,
            alias: row.alias,
            source: row.source as 'user' | 'llm' | 'ingest',
            createdAt: row.createdAt,
          },
          target: {
            kind: 'variant',
            id: variant.id,
            slug: variant.slug,
            name: variant.name,
            parentIngredientSlug: variant.parentSlug,
            parentIngredientName: variant.parentName,
          },
        },
      ];
    }
    return [];
  });
}
