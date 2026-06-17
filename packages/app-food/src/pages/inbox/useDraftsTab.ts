/**
 * PRD-134 — React Query plumbing for the Drafts inbox tab.
 *
 * Splits the data hook out of `DraftsTab.tsx` so the page component stays
 * under the per-file line cap and the hook is testable on its own. Polling
 * runs every 60s so newly-completed ingests appear without a manual refresh
 * — React Query disables background polling automatically when the tab is
 * hidden.
 */
import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../food-api-helpers.js';
import { inboxList } from '../../food-api/index.js';
import { type DraftsFiltersState, toQueryInput } from './drafts-filters.js';

interface UseDraftsTabOpts {
  filters: DraftsFiltersState;
}

const DRAFTS_POLL_INTERVAL_MS = 60_000;

export function useDraftsTab({ filters }: UseDraftsTabOpts) {
  const queryInput = toQueryInput(filters);
  const query = useQuery({
    queryKey: ['food', 'inbox', 'list', queryInput],
    queryFn: async () => unwrap(await inboxList({ body: queryInput })),
    refetchInterval: DRAFTS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  return {
    rows: query.data?.items ?? [],
    nextCursor: query.data?.nextCursor ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
