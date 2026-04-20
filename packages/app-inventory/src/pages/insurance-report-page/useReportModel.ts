import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import { trpc } from '@pops/api-client';

type SortBy = 'value' | 'name' | 'type';

export function useReportModel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const locationId = searchParams.get('locationId') ?? undefined;
  const includeChildren = searchParams.get('includeChildren') !== 'false';
  const sortBy = (searchParams.get('sortBy') as SortBy) || 'value';

  const { data, isLoading } = trpc.inventory.reports.insuranceReport.useQuery({
    locationId,
    includeChildren: locationId ? includeChildren : undefined,
    sortBy,
  });
  const { data: locationsData } = trpc.inventory.locations.tree.useQuery();
  const locationTree = locationsData?.data ?? [];

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const handleLocationChange = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) {
            next.set('locationId', id);
          } else {
            next.delete('locationId');
            next.delete('includeChildren');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return {
    locationId,
    includeChildren,
    sortBy,
    report: data?.data,
    isLoading,
    locationTree,
    updateParam,
    handleLocationChange,
  };
}
