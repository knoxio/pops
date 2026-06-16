import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../lists-api-helpers.js';
import { listListAggregate } from '../../lists-api/index.js';
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

type AggregateQuery = {
  kinds?: ListKind[];
  includeArchived: boolean;
  sort: ListsIndexFilterState['sort'];
};

export interface UseListsIndexQueryResult {
  items: ListIndexItemView[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Wraps the lists pillar's aggregate index endpoint so the page component
 * stays declarative. The route returns `{ itemCount, uncheckedCount,
 * lastUpdatedAt }` precomputed; the hook narrows it to a stable view type
 * and converts query state into the loading / error / data triple the page
 * renders.
 */
export function useListsIndexQuery(filters: ListsIndexFilterState): UseListsIndexQueryResult {
  const input = useMemo<AggregateQuery>(
    () => ({
      kinds: isAllKinds(filters.kinds) || filters.kinds.length === 0 ? undefined : filters.kinds,
      includeArchived: filters.includeArchived,
      sort: filters.sort,
    }),
    [filters]
  );

  const query = useQuery({
    queryKey: ['lists', 'list', 'listAggregate', input],
    queryFn: async () => unwrap(await listListAggregate({ query: input })),
  });

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
