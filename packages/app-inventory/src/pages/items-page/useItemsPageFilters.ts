import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

export function useItemsPageFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const debouncedSearch = useDebouncedValue(search, 300);
  const typeFilter = searchParams.get('type') ?? '';
  const conditionFilter = searchParams.get('condition') ?? '';
  const inUseFilter = searchParams.get('inUse') ?? '';
  const locationFilter = searchParams.get('locationId') ?? '';

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      });
    },
    [setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('type');
      next.delete('condition');
      next.delete('inUse');
      next.delete('locationId');
      return next;
    });
  }, [setSearchParams]);

  return {
    search,
    debouncedSearch,
    typeFilter,
    conditionFilter,
    inUseFilter,
    locationFilter,
    setParam,
    clearFilters,
  };
}

export type Filters = ReturnType<typeof useItemsPageFilters>;

export function buildQueryInput(filters: Filters) {
  return {
    search: filters.debouncedSearch || undefined,
    type: filters.typeFilter || undefined,
    condition: filters.conditionFilter || undefined,
    inUse: (filters.inUseFilter || undefined) as 'true' | 'false' | undefined,
    locationId: filters.locationFilter || undefined,
    limit: 200,
  };
}

export function hasAnyActiveFilter(filters: Filters): boolean {
  return Boolean(
    filters.typeFilter || filters.conditionFilter || filters.inUseFilter || filters.locationFilter
  );
}
