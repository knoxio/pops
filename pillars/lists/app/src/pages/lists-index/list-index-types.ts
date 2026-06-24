/**
 * Shared types + constants for the `/lists` index page.
 *
 * Mirrors the contract's `KIND_ENUM` / `SORT_ENUM` so the filter UI stays in
 * lock-step with the REST contract. Source of truth is
 * `pillars/lists/src/contract/rest-schemas.ts` (list query input lives in
 * `pillars/lists/src/contract/rest-list.ts`).
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
 * Kind filter is multi-select, default all selected. The chip strip reflects
 * that visually (every chip starts active), and the query hook collapses a
 * fully-selected set to `undefined` so the API skips the WHERE-IN clause
 * entirely (same wire-shape as no filter).
 */
export const DEFAULT_FILTERS: ListsIndexFilterState = {
  kinds: [...LIST_KINDS],
  includeArchived: false,
  sort: 'updated',
};

export const DEFAULT_NEW_LIST_KIND: ListKind = 'shopping';
