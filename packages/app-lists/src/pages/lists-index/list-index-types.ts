/**
 * Shared types + constants for the `/lists` index page (PRD-140 part B).
 *
 * Mirrors the `lists.list.list` tRPC input enum so the filter UI stays in
 * lock-step with the router. The router source of truth is at
 * `apps/pops-api/src/modules/lists/routers/list.ts`.
 */

export const LIST_KINDS = ['shopping', 'packing', 'todo', 'generic'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const SORT_OPTIONS = ['updated', 'name', 'created'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export interface ListsIndexFilterState {
  kinds: ListKind[];
  includeArchived: boolean;
  sort: SortOption;
}

/**
 * PRD-140 §Index — kind filter "multi-select, default: all selected". The
 * chip strip reflects that visually (every chip starts active), and the
 * query hook collapses a fully-selected set to `undefined` so the router
 * skips the WHERE-IN clause entirely (same wire-shape as no filter).
 */
export const DEFAULT_FILTERS: ListsIndexFilterState = {
  kinds: [...LIST_KINDS],
  includeArchived: false,
  sort: 'updated',
};

export const DEFAULT_NEW_LIST_KIND: ListKind = 'shopping';
