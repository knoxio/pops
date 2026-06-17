/**
 * Build a hierarchical tree of ingredients from a flat list.
 *
 * Enforces alphabetical (slug) order at every level — the API already
 * returns rows sorted that way, but we sort defensively so callers passing
 * unsorted input still get deterministic ordering. Orphan rows (parent_id
 * pointing at an ingredient missing from the list — e.g. a search filter
 * dropped it) get re-rooted so they remain visible.
 */
import type { IngredientRow } from './ingredient-wire-types.js';

export interface IngredientTreeNode {
  row: IngredientRow;
  children: IngredientTreeNode[];
}

function sortBySlug(nodes: IngredientTreeNode[]): IngredientTreeNode[] {
  nodes.sort((a, b) => a.row.slug.localeCompare(b.row.slug));
  for (const node of nodes) sortBySlug(node.children);
  return nodes;
}

export function buildIngredientTree(rows: readonly IngredientRow[]): IngredientTreeNode[] {
  const byId = new Map<number, IngredientTreeNode>();
  for (const row of rows) {
    byId.set(row.id, { row, children: [] });
  }
  const roots: IngredientTreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.row.parentId;
    const parent = parentId !== null ? byId.get(parentId) : undefined;
    if (parent !== undefined) {
      parent.children.push(node);
    } else {
      // Either a true root, or an orphan whose parent isn't in the
      // current result set (e.g. filtered out by search) — treat it
      // as a root so the user can still see it.
      roots.push(node);
    }
  }
  return sortBySlug(roots);
}
