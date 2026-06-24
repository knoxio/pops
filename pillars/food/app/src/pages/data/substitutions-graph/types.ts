/**
 * Local view-model types for the substitution graph explorer.
 *
 * These mirror the wire shape served by the food contract's graphView
 * route (`pillars/food/src/contract/rest-substitutions.ts`, generated
 * into `app/src/food-api/types.gen.ts`). They are duplicated here
 * intentionally so the page components stay a self-contained unit for
 * vitest + RTL; here we exercise rendering against the shape.
 */
export interface SubGraphNode {
  id: string;
  kind: 'ingredient' | 'variant';
  ingredientId: number;
  variantId: number | null;
  ingredientSlug: string;
  ingredientName: string;
  variantSlug: string | null;
  variantName: string | null;
}

export interface SubGraphEdge {
  id: number;
  fromNodeId: string;
  toNodeId: string;
  ratio: number;
  contextTags: readonly string[];
  scope: 'global' | 'recipe';
  recipeId: number | null;
  recipeSlug: string | null;
  notes: string | null;
}

export interface SubGraphView {
  nodes: SubGraphNode[];
  edges: SubGraphEdge[];
}

export type SubGraphScope = 'global' | 'recipe';
