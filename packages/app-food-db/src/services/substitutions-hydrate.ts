/**
 * Hydrated list helper for the substitutions tab (PRD-122-D).
 *
 * The base `listSubstitutions` returns raw FK ids on each endpoint. This
 * helper widens each row with the slug + display name resolved from the
 * matching ingredient / variant + parent ingredient + recipe, in batched
 * lookups, so the wire output is ready for the UI table without per-row
 * roundtrips.
 */
import { inArray } from 'drizzle-orm';

import { ingredients, ingredientVariants, recipes } from '../schema.js';
import { listSubstitutions, type ListSubstitutionsInput } from './substitutions-queries.js';

import type { FoodDb } from './internal.js';
import type { SubstitutionView } from './substitutions.js';

export interface HydratedEndpoint {
  kind: 'ingredient' | 'variant';
  id: number;
  slug: string;
  /** Display name; empty string if the row was deleted out-of-band. */
  name: string;
  /** Parent ingredient slug — populated only when `kind === 'variant'`. */
  parentSlug: string | null;
}

export interface HydratedSubstitutionView extends SubstitutionView {
  from: HydratedEndpoint;
  to: HydratedEndpoint;
  /** Resolved recipe slug; null for global-scope rows. */
  recipeSlug: string | null;
}

interface IngredientLite {
  id: number;
  slug: string;
  name: string;
}

interface VariantLite {
  id: number;
  slug: string;
  name: string;
  ingredientId: number;
}

interface RecipeLite {
  id: number;
  slug: string;
}

function ingredientMap(db: FoodDb, ids: readonly number[]): Map<number, IngredientLite> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: ingredients.id, slug: ingredients.slug, name: ingredients.name })
    .from(ingredients)
    .where(inArray(ingredients.id, [...ids]))
    .all();
  return new Map(rows.map((r) => [r.id, r]));
}

function variantMap(db: FoodDb, ids: readonly number[]): Map<number, VariantLite> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({
      id: ingredientVariants.id,
      slug: ingredientVariants.slug,
      name: ingredientVariants.name,
      ingredientId: ingredientVariants.ingredientId,
    })
    .from(ingredientVariants)
    .where(inArray(ingredientVariants.id, [...ids]))
    .all();
  return new Map(rows.map((r) => [r.id, r]));
}

function recipeMap(db: FoodDb, ids: readonly number[]): Map<number, RecipeLite> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: recipes.id, slug: recipes.slug })
    .from(recipes)
    .where(inArray(recipes.id, [...ids]))
    .all();
  return new Map(rows.map((r) => [r.id, r]));
}

function ingredientEndpoint(id: number, ings: Map<number, IngredientLite>): HydratedEndpoint {
  const row = ings.get(id);
  return {
    kind: 'ingredient',
    id,
    slug: row?.slug ?? '',
    name: row?.name ?? '',
    parentSlug: null,
  };
}

function variantEndpoint(
  id: number,
  vars: Map<number, VariantLite>,
  ings: Map<number, IngredientLite>
): HydratedEndpoint {
  const v = vars.get(id);
  const parent = v ? ings.get(v.ingredientId) : undefined;
  return {
    kind: 'variant',
    id,
    slug: v?.slug ?? '',
    name: v?.name ?? '',
    parentSlug: parent?.slug ?? null,
  };
}

function buildEndpoint(
  ingId: number | null,
  varId: number | null,
  ings: Map<number, IngredientLite>,
  vars: Map<number, VariantLite>
): HydratedEndpoint {
  if (ingId !== null) return ingredientEndpoint(ingId, ings);
  if (varId !== null) return variantEndpoint(varId, vars, ings);
  throw new Error('substitution endpoint has neither ingredient_id nor variant_id');
}

function uniq(values: readonly (number | null)[]): number[] {
  const set = new Set<number>();
  for (const v of values) if (v !== null) set.add(v);
  return [...set];
}

export function listSubstitutionsHydrated(
  db: FoodDb,
  input: ListSubstitutionsInput = {}
): HydratedSubstitutionView[] {
  const rows = listSubstitutions(db, input);
  const ingredientIds = uniq([
    ...rows.map((r) => r.fromIngredientId),
    ...rows.map((r) => r.toIngredientId),
  ]);
  const variantIds = uniq([...rows.map((r) => r.fromVariantId), ...rows.map((r) => r.toVariantId)]);
  const recipeIds = uniq(rows.map((r) => r.recipeId));
  const vars = variantMap(db, variantIds);
  const parentIngredientIds = [...vars.values()].map((v) => v.ingredientId);
  const ings = ingredientMap(db, [...ingredientIds, ...parentIngredientIds]);
  const recs = recipeMap(db, recipeIds);
  return rows.map((row) => ({
    ...row,
    from: buildEndpoint(row.fromIngredientId, row.fromVariantId, ings, vars),
    to: buildEndpoint(row.toIngredientId, row.toVariantId, ings, vars),
    recipeSlug: row.recipeId !== null ? (recs.get(row.recipeId)?.slug ?? null) : null,
  }));
}
