/**
 * Shared types for the `/lists/:id` detail page (PRD-140-C).
 *
 * Wire shapes are re-exported from `@pops/app-lists-db` so the page renders
 * the exact rows the backend services return. The discriminated `ListKind`
 * union mirrors the SQLite CHECK constraint on `lists.kind`.
 */
import type { ListItemRefKind, ListItemRow, ListKind, ListRow } from '@pops/app-lists-db';

export type { ListItemRefKind, ListItemRow, ListKind, ListRow };

export interface ListWithItems {
  list: ListRow;
  items: readonly ListItemRow[];
}

export const LIST_KINDS: readonly ListKind[] = ['shopping', 'packing', 'todo', 'generic'];
