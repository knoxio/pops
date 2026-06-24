/**
 * Query wrapper for the food REST SDK's `solverCanICook` endpoint.
 *
 * Polls every 60s while the page is visible (see the Polling section of
 * pillars/food/docs/prds/cook-solver). The
 * `refetchIntervalInBackground: false` flag pauses the timer when
 * `document.visibilityState !== 'visible'` so a backgrounded tab
 * doesn't burn solver budget.
 */
import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../food-api-helpers.js';
import { solverCanICook } from '../../food-api/index.js';

const POLL_INTERVAL_MS = 60_000;

export interface SolveFilterState {
  excludeSubs: boolean;
  recipeTypes: readonly (
    | 'plate'
    | 'component'
    | 'technique'
    | 'sauce'
    | 'dressing'
    | 'drink'
    | 'condiment'
  )[];
  tags: readonly string[];
  /** Minutes, or null for "no limit". */
  maxMinutes: number | null;
}

export const DEFAULT_SOLVE_FILTERS: SolveFilterState = {
  excludeSubs: false,
  recipeTypes: [],
  tags: [],
  maxMinutes: null,
};

interface UseSolveResultArgs {
  filters: SolveFilterState;
}

export function useSolveResult({ filters }: UseSolveResultArgs) {
  const input = {
    excludeSubs: filters.excludeSubs || undefined,
    recipeTypes: filters.recipeTypes.length === 0 ? undefined : [...filters.recipeTypes],
    tags: filters.tags.length === 0 ? undefined : [...filters.tags],
    maxMinutes: filters.maxMinutes ?? undefined,
  };
  const query = useQuery({
    queryKey: ['food', 'solver', 'canICook', input],
    queryFn: async () => unwrap(await solverCanICook({ body: input })),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}
