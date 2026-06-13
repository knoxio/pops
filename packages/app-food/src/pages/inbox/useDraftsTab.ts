/**
 * PRD-134 — React Query plumbing for the Drafts inbox tab.
 *
 * Splits the data hook out of `DraftsTab.tsx` so the page component stays
 * under the per-file line cap and the hook is testable on its own. Polling
 * runs every 60s so newly-completed ingests appear without a manual refresh
 * — React Query disables background polling automatically when the tab is
 * hidden.
 */
import { usePillarQuery } from '@pops/pillar-sdk/react';

import { type DraftsFiltersState, toQueryInput } from './drafts-filters.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

type InboxListOutput = inferRouterOutputs<AppRouter>['food']['inbox']['list'];

interface UseDraftsTabOpts {
  filters: DraftsFiltersState;
}

const DRAFTS_POLL_INTERVAL_MS = 60_000;

export function useDraftsTab({ filters }: UseDraftsTabOpts) {
  const queryInput = toQueryInput(filters);
  const query = usePillarQuery<InboxListOutput>('food', ['inbox', 'list'], queryInput, {
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
