/**
 * Graph-view composition helpers for the substitutions router.
 *
 * Extracted from `substitutions.ts` so the router file fits under the
 * per-file lint cap after PRD-149 added the `resolveForLine` procedure.
 */
import type { GraphViewEdgeRow, GraphViewSide } from '../../../db/index.js';

export interface GraphViewNode {
  id: string;
  kind: 'ingredient' | 'variant';
  ingredientId: number;
  variantId: number | null;
  ingredientSlug: string;
  ingredientName: string;
  variantSlug: string | null;
  variantName: string | null;
}

export interface GraphViewEdge {
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

export interface GraphView {
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
}

/**
 * Graph-view composite id. Encodes the side as `ingredient:<id>` or
 * `variant:<id>` so the client can dedupe nodes across edges without
 * doing any schema reasoning. Throws on a malformed side (`kind='variant'`
 * without a `variantId`) rather than silently coercing to `variant:0`.
 */
export function sideToNodeId(side: GraphViewSide): string {
  if (side.kind === 'variant') {
    if (side.variantId === null) {
      throw new Error(
        `graphView: variant side missing variantId (CHECK drift on ingredient ${side.ingredientId})`
      );
    }
    return `variant:${side.variantId}`;
  }
  return `ingredient:${side.ingredientId}`;
}

/** Compose the minimum spanning subgraph of nodes that any edge touches. */
export function deriveNodes(edges: GraphViewEdgeRow[]): GraphViewNode[] {
  const byId = new Map<string, GraphViewNode>();
  for (const edge of edges) {
    for (const side of [edge.fromSide, edge.toSide]) {
      const id = sideToNodeId(side);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        kind: side.kind,
        ingredientId: side.ingredientId,
        variantId: side.variantId,
        ingredientSlug: side.ingredientSlug,
        ingredientName: side.ingredientName,
        variantSlug: side.variantSlug,
        variantName: side.variantName,
      });
    }
  }
  return [...byId.values()];
}
