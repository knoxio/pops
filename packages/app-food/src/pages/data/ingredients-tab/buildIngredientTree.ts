/**
 * Build a hierarchical tree of ingredients from a flat list.
 *
 * The food schema caps depth at 3 (PRD-106 invariant), and the API
 * returns rows already sorted by slug (PRD-122-API), so the tree
 * preserves alphabetical order at every level. Orphan rows (parent_id
 * points at an ingredient that's missing from the list — e.g. because
 * a search filter dropped it) get re-rooted so they remain visible.
 */
import type { IngredientRow } from '@pops/app-food-db';

export interface IngredientTreeNode {
  row: IngredientRow;
  children: IngredientTreeNode[];
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
  return roots;
}
