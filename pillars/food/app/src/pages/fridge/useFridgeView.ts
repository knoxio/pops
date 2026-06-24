/**
 * REST client wrapper for `fridgeView`.
 *
 * Owns the cache key for the fridge query so the mutation handlers in
 * the sibling modals can invalidate one place when a batch changes.
 */
import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../food-api-helpers.js';
import { fridgeView } from '../../food-api/index.js';

import type { FridgeViewResponses } from '../../food-api/types.gen.js';

type FridgeViewOutput = FridgeViewResponses[200];

/**
 * There is intentionally no prep-state filter: the
 * `pillars/food/docs/prds/fridge-view` overview mentions one, but its
 * filter-chip / `fridgeView` schema does not enumerate it. To add one,
 * thread `prepStateId` here, into the request body, and into a
 * `prep_state_id =` clause in
 * `pillars/food/src/api/modules/fridge/view-query.ts`.
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
  data: FridgeViewOutput | undefined;
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

  const query = useQuery({
    queryKey: ['food', 'fridge', 'view', input],
    queryFn: async () => unwrap(await fridgeView({ body: input })),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
