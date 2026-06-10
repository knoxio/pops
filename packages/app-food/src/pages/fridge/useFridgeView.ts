/**
 * tRPC client wrapper for `food.fridge.view` — PRD-147.
 *
 * Owns the cache key for the fridge query so the mutation handlers in
 * the sibling modals can invalidate one place when a batch changes.
 */
import { trpc } from '@pops/api-client';

import type { FridgeView } from '@pops/app-food-db';

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

  const query = trpc.food.fridge.view.useQuery(input);

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
