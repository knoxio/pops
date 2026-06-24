/**
 * Internal helpers split out of `substitutions-graph.ts` so each file
 * stays under the per-file lint cap. Pure functions over the hydrated-
 * lookup maps + the substitutions schema; no external API surface.
 */
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';

import {
  ingredients,
  ingredientVariants,
  recipes,
  substitutions,
  type SubstitutionRow,
} from '../schema.js';
import { type FoodDb } from './internal.js';

import type { GraphViewSide } from './substitutions-graph-types.js';
import type {
  GraphViewFilter,
  IngredientLite,
  RecipeLite,
  VariantLite,
} from './substitutions-graph-types.js';
import type { SubstitutionScope } from './substitutions.js';

export function parseContextTags(raw: string): readonly string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`context_tags is not a JSON array: ${raw}`);
  }
  return parsed.map((value, idx) => {
    if (typeof value !== 'string') {
      throw new Error(`context_tags[${idx}] is not a string: ${JSON.stringify(value)}`);
    }
    return value;
  });
}

export function fetchEdgeRows(db: FoodDb, filter: GraphViewFilter): SubstitutionRow[] {
  const filters: SQL[] = [];
  const scope: SubstitutionScope = filter.scope ?? 'global';
  // Defend the invariant at the service boundary too — the REST router
  // refuses scope='recipe' without recipeId, but this helper is also
  // callable directly from worker / seed code where the boundary check
  // wouldn't run. Without this guard, `scope='recipe'` without recipeId
  // would silently return ALL recipe-scoped edges across every recipe.
  if (scope === 'recipe' && filter.recipeId === undefined) {
    throw new Error(`fetchEdgeRows: scope='recipe' requires recipeId`);
  }
  filters.push(eq(substitutions.scope, scope));
  if (scope === 'recipe' && filter.recipeId !== undefined) {
    filters.push(eq(substitutions.recipeId, filter.recipeId));
  }
  if (filter.contextTag !== undefined) {
    const tagMatch = or(
      sql`json_array_length(${substitutions.contextTags}) = 0`,
      sql`EXISTS (SELECT 1 FROM json_each(${substitutions.contextTags}) WHERE value = ${filter.contextTag})`
    );
    if (tagMatch !== undefined) filters.push(tagMatch);
  }
  return db
    .select()
    .from(substitutions)
    .where(and(...filters))
    .all();
}

export interface LookupMaps {
  ingByIs: Map<number, IngredientLite>;
  varById: Map<number, VariantLite>;
  recipeById: Map<number, RecipeLite>;
}

export function fetchLookups(db: FoodDb, rows: SubstitutionRow[]): LookupMaps {
  const { ingIds, variantIds, recipeIds } = collectIds(rows);
  const variantRows = loadVariants(db, variantIds);
  for (const v of variantRows) ingIds.add(v.ingredientId);
  const ingredientRows = loadIngredients(db, ingIds);
  const recipeRows = loadRecipes(db, recipeIds);
  return {
    ingByIs: new Map(ingredientRows.map((r) => [r.id, r])),
    varById: new Map(variantRows.map((r) => [r.id, r])),
    recipeById: new Map(recipeRows.map((r) => [r.id, r])),
  };
}

function collectIds(rows: SubstitutionRow[]): {
  ingIds: Set<number>;
  variantIds: Set<number>;
  recipeIds: Set<number>;
} {
  const ingIds = new Set<number>();
  const variantIds = new Set<number>();
  const recipeIds = new Set<number>();
  for (const row of rows) {
    if (row.fromIngredientId !== null) ingIds.add(row.fromIngredientId);
    if (row.toIngredientId !== null) ingIds.add(row.toIngredientId);
    if (row.fromVariantId !== null) variantIds.add(row.fromVariantId);
    if (row.toVariantId !== null) variantIds.add(row.toVariantId);
    if (row.recipeId !== null) recipeIds.add(row.recipeId);
  }
  return { ingIds, variantIds, recipeIds };
}

function loadVariants(db: FoodDb, ids: Set<number>): VariantLite[] {
  if (ids.size === 0) return [];
  return db
    .select({
      id: ingredientVariants.id,
      ingredientId: ingredientVariants.ingredientId,
      slug: ingredientVariants.slug,
      name: ingredientVariants.name,
    })
    .from(ingredientVariants)
    .where(inArray(ingredientVariants.id, [...ids]))
    .all();
}

function loadIngredients(db: FoodDb, ids: Set<number>): IngredientLite[] {
  if (ids.size === 0) return [];
  return db
    .select({ id: ingredients.id, slug: ingredients.slug, name: ingredients.name })
    .from(ingredients)
    .where(inArray(ingredients.id, [...ids]))
    .all();
}

function loadRecipes(db: FoodDb, ids: Set<number>): RecipeLite[] {
  if (ids.size === 0) return [];
  return db
    .select({ id: recipes.id, slug: recipes.slug })
    .from(recipes)
    .where(inArray(recipes.id, [...ids]))
    .all();
}

export function makeSide(
  ingredientId: number | null,
  variantId: number | null,
  ingByIs: Map<number, IngredientLite>,
  varById: Map<number, VariantLite>
): GraphViewSide {
  if (variantId !== null) return makeVariantSide(variantId, ingByIs, varById);
  if (ingredientId === null) {
    throw new Error('graphView: side has neither ingredient_id nor variant_id (CHECK drift)');
  }
  const ingredient = ingByIs.get(ingredientId);
  if (ingredient === undefined) {
    throw new Error(`graphView: ingredient ${ingredientId} not found (FK drift)`);
  }
  return {
    kind: 'ingredient',
    ingredientId: ingredient.id,
    variantId: null,
    ingredientSlug: ingredient.slug,
    ingredientName: ingredient.name,
    variantSlug: null,
    variantName: null,
  };
}

function makeVariantSide(
  variantId: number,
  ingByIs: Map<number, IngredientLite>,
  varById: Map<number, VariantLite>
): GraphViewSide {
  const variant = varById.get(variantId);
  if (variant === undefined) {
    throw new Error(`graphView: variant ${variantId} not found (FK drift)`);
  }
  const parent = ingByIs.get(variant.ingredientId);
  if (parent === undefined) {
    throw new Error(
      `graphView: variant ${variantId} references missing ingredient ${variant.ingredientId} (FK drift)`
    );
  }
  return {
    kind: 'variant',
    ingredientId: parent.id,
    variantId: variant.id,
    ingredientSlug: parent.slug,
    ingredientName: parent.name,
    variantSlug: variant.slug,
    variantName: variant.name,
  };
}
