import { useMemo } from 'react';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import { LIST_KINDS, type ListKind, type ListsIndexFilterState } from './list-index-types.js';

function isAllKinds(kinds: readonly ListKind[]): boolean {
  return kinds.length === LIST_KINDS.length && LIST_KINDS.every((k) => kinds.includes(k));
}

export interface ListIndexItemView {
  id: number;
  name: string;
  kind: ListKind;
  ownerApp: string;
  itemCount: number;
  uncheckedCount: number;
  lastUpdatedAt: string;
  archivedAt: string | null;
}

interface ListsIndexPayload {
  items: ListIndexItemView[];
}

export interface UseListsIndexQueryResult {
  items: ListIndexItemView[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Wraps the `lists` pillar's `list.list` query so the page component stays
 * declarative. The router-owned aggregate query already returns the shape
 * the UI needs (`itemCount` / `uncheckedCount` / `lastUpdatedAt`); the hook
 * narrows it to a stable view type and converts query state into the
 * loading / error / data triple the page renders.
 *
 * No infinite scroll: PRD-140 §Index leaves pagination out of v1 because
 * lists are user-managed and volume stays in the dozens. When the router
 * adds a cursor (it currently does not), swap this for `useInfiniteQuery`.
 */
export function useListsIndexQuery(filters: ListsIndexFilterState): UseListsIndexQueryResult {
  const input = useMemo(
    () => ({
      // "All selected" + "none selected" both mean "no filter" to the
      // router — collapse to `undefined` in both cases so the SQL skips
      // the WHERE-IN clause. The chip strip distinguishes the two states
      // visually (all-on vs all-off).
      kinds: isAllKinds(filters.kinds) || filters.kinds.length === 0 ? undefined : filters.kinds,
      includeArchived: filters.includeArchived,
      sort: filters.sort,
    }),
    [filters]
  );

  const query = usePillarQuery<ListsIndexPayload>('lists', ['list', 'list'], input);

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
