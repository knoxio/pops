/**
 * Local view-model types for the PRD-148 substitution graph explorer.
 *
 * These mirror the wire shape produced by `food.substitutions.graphView`
 * (defined in `apps/pops-api/src/modules/food/routers/substitutions.ts`).
 * They are duplicated here intentionally so the page components remain a
 * self-contained unit for vitest + RTL — no cross-package type plumbing
 * between the page tests and the running pops-api router. The wire shape
 * itself is covered end-to-end by `substitutions-graph.test.ts` on the API
 * side; here we exercise rendering against the shape.
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
