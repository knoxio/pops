/**
 * tRPC client wrapper for `food.fridge.view` — PRD-147.
 *
 * Owns the cache key for the fridge query so the mutation handlers in
 * the sibling modals can invalidate one place when a batch changes.
 */
import { usePillarQuery } from '@pops/pillar-sdk/react';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';
import type { FridgeView } from '@pops/app-food-db';

type FridgeViewOutput = inferRouterOutputs<AppRouter>['food']['fridge']['view'];

/**
 * PRD-147's overview blurb mentions a prep-state filter, but the spec
 * body (filter chips, `food.fridge.view` Zod schema) does not enumerate
 * one. Treating it as a documented deferral for v1 — re-instate by
 * adding `prepStateId` here, in `FridgeViewInputSchema`, and a SQL
 * `prep_state_id =` clause in `view-query.ts` once the design picks a
 * single-select vs multi-select shape.
 */
export interface FridgeFilterState {
  search: string;
  locations: ('pantry' | 'fridge' | 'freezer' | 'other')[];
  expiringSoon: boolean;
  recipeYieldedOnly: boolean;
  showAll: boolean;
}

export const DEFAULT_FRIDGE_FILTERS: FridgeFilterState = {
  search: '',
  locations: [],
  expiringSoon: false,
  recipeYieldedOnly: false,
  showAll: false,
};

interface UseFridgeViewArgs {
  filters: FridgeFilterState;
  debouncedSearch: string;
}

export interface UseFridgeViewResult {
  data: FridgeView | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useFridgeView({
  filters,
  debouncedSearch,
}: UseFridgeViewArgs): UseFridgeViewResult {
  const input = {
    search: debouncedSearch.length === 0 ? undefined : debouncedSearch,
    locations: filters.locations.length === 0 ? undefined : filters.locations,
    expiringSoon: filters.expiringSoon || undefined,
    recipeYieldedOnly: filters.recipeYieldedOnly || undefined,
    includeEmpty: filters.showAll || undefined,
    includeDeleted: filters.showAll || undefined,
  };

  const query = usePillarQuery<FridgeViewOutput>('food', ['fridge', 'view'], input);

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
