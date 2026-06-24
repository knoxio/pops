/**
 * Pure utilities for the substitution graph explorer.
 *
 * Kept free of React + i18n so each can be unit-tested in isolation and
 * reused across `ForceGraphCanvas`, `RadialFocusView`, and the side
 * panels. Anything that takes a `t()` callback or rendered JSX lives in
 * its own component file.
 */
import type { SubGraphEdge, SubGraphNode } from './types';

/** Render label for a node: `ingredient · variant` or just `ingredient`. */
export function nodeLabel(node: SubGraphNode): string {
  if (node.kind === 'variant' && node.variantName !== null) {
    return `${node.ingredientName} · ${node.variantName}`;
  }
  return node.ingredientName;
}

/**
 * Render slug for a node. For variants we use the `parent:variant` form
 * that matches the URL `?node=<slug>` convention used for radial focus.
 */
export function nodeSlug(node: SubGraphNode): string {
  if (node.kind === 'variant' && node.variantSlug !== null) {
    return `${node.ingredientSlug}:${node.variantSlug}`;
  }
  return node.ingredientSlug;
}

/**
 * Resolve a node from a `?node=<slug>` URL parameter. Accepts both
 * `parent:variant` and bare `ingredient` forms. Returns `null` if no
 * node in the current view matches the slug.
 */
export function findNodeBySlug(nodes: readonly SubGraphNode[], slug: string): SubGraphNode | null {
  const target = slug.toLowerCase();
  return (
    nodes.find((n) => nodeSlug(n).toLowerCase() === target) ??
    nodes.find((n) => n.ingredientSlug.toLowerCase() === target) ??
    null
  );
}

/**
 * Map a ratio to one of three discrete "thickness buckets" — cosmetic
 * only. A non-trivial ratio (outside the 0.5..2.0 band) draws a thick
 * line so the user spots non-1:1 subs at a glance.
 */
export type EdgeThickness = 'thin' | 'normal' | 'thick';

export function edgeThickness(ratio: number): EdgeThickness {
  if (!Number.isFinite(ratio) || ratio <= 0) return 'thin';
  if (ratio < 0.5 || ratio > 2.0) return 'thick';
  if (Math.abs(ratio - 1) < 0.05) return 'normal';
  return 'normal';
}

export function edgeThicknessPx(thickness: EdgeThickness): number {
  if (thickness === 'thick') return 4;
  if (thickness === 'thin') return 1;
  return 2;
}

/** Bucket edges into incoming + outgoing relative to a focus node. */
export interface EdgePartition {
  incoming: SubGraphEdge[];
  outgoing: SubGraphEdge[];
}

export function partitionEdgesAroundNode(
  edges: readonly SubGraphEdge[],
  focus: SubGraphNode
): EdgePartition {
  const incoming: SubGraphEdge[] = [];
  const outgoing: SubGraphEdge[] = [];
  for (const edge of edges) {
    if (edge.fromNodeId === focus.id) outgoing.push(edge);
    else if (edge.toNodeId === focus.id) incoming.push(edge);
  }
  return { incoming, outgoing };
}

/** Aggregate the distinct context tags observed in a view's edges. */
export function distinctContextTags(edges: readonly SubGraphEdge[]): string[] {
  const seen = new Set<string>();
  for (const edge of edges) {
    for (const tag of edge.contextTags) seen.add(tag);
  }
  return [...seen].toSorted();
}
