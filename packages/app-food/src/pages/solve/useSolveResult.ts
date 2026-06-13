/**
 * tRPC client wrapper for `food.solver.canICook` — PRD-150.
 *
 * Polls every 60s while the page is visible (PRD-150 §Polling). The
 * `refetchIntervalInBackground: false` flag pauses the timer when
 * `document.visibilityState !== 'visible'` so a backgrounded tab
 * doesn't burn solver budget.
 */
import { usePillarQuery } from '@pops/pillar-sdk/react';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

type CanICookOutput = inferRouterOutputs<AppRouter>['food']['solver']['canICook'];

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
  const query = usePillarQuery<CanICookOutput>('food', ['solver', 'canICook'], input, {
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}
