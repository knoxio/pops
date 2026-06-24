/**
 * Shared types for the `/lists/:id` detail page.
 *
 * Row shapes are derived from the generated Hey API SDK so the page renders
 * the exact rows the lists pillar returns. The discriminated `ListKind`
 * union mirrors the SQLite CHECK constraint on `lists.kind`.
 */
import type { ListGetResponses } from '../../lists-api/types.gen.js';

type DetailPayload = NonNullable<ListGetResponses[200]>;

export type ListRow = DetailPayload['list'];
export type ListItemRow = DetailPayload['items'][number];
export type ListKind = ListRow['kind'];
export type ListItemRefKind = ListItemRow['refKind'];

export interface ListWithItems {
  list: ListRow;
  items: readonly ListItemRow[];
}

export const LIST_KINDS: readonly ListKind[] = ['shopping', 'packing', 'todo', 'generic'];
