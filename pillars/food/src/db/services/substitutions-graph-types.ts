/**
 * Public shapes for the substitution graph-view query. Split out of the
 * service module so consumers (the REST router) can import types
 * without pulling in drizzle.
 */
import type { SubstitutionScope } from './substitutions.js';

export interface GraphViewFilter {
  scope?: SubstitutionScope;
  recipeId?: number;
  contextTag?: string;
  search?: string;
}

export interface GraphViewSide {
  kind: 'ingredient' | 'variant';
  ingredientId: number;
  variantId: number | null;
  ingredientSlug: string;
  ingredientName: string;
  variantSlug: string | null;
  variantName: string | null;
}

export interface GraphViewEdgeRow {
  id: number;
  fromSide: GraphViewSide;
  toSide: GraphViewSide;
  ratio: number;
  contextTags: readonly string[];
  scope: SubstitutionScope;
  recipeId: number | null;
  recipeSlug: string | null;
  notes: string | null;
}

export interface GraphViewResult {
  edges: GraphViewEdgeRow[];
}

/** Lookup row shapes used by the service helpers. Not exposed to clients. */
export interface IngredientLite {
  id: number;
  slug: string;
  name: string;
}

export interface VariantLite {
  id: number;
  ingredientId: number;
  slug: string;
  name: string;
}

export interface RecipeLite {
  id: number;
  slug: string;
}
