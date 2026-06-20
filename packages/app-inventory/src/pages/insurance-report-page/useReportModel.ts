import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import { unwrap } from '../../inventory-api-helpers.js';
import { locationsTree, reportsInsuranceReport } from '../../inventory-api/index.js';

import type { LocationTreeNode } from '../../components/LocationPicker';
import type { ReportGroup } from './csv';

type SortBy = 'value' | 'name' | 'type';

interface InsuranceReport {
  totalItems: number;
  totalValue: number;
  groups: ReportGroup[];
}

interface InsuranceReportResult {
  data: InsuranceReport;
}

interface LocationsTreeResult {
  data: LocationTreeNode[];
}

function useSearchParamHelpers() {
  const [, setSearchParams] = useSearchParams();

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

  return { updateParam, handleLocationChange };
}

export function useReportModel() {
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get('locationId') ?? undefined;
  const includeChildren = searchParams.get('includeChildren') !== 'false';
  const sortBy = (searchParams.get('sortBy') as SortBy) || 'value';

  const reportInput = {
    locationId,
    includeChildren: locationId ? includeChildren : undefined,
    sortBy,
  };
  const { data, isLoading } = useQuery<InsuranceReportResult>({
    queryKey: ['inventory', 'reports', 'insuranceReport', reportInput],
    queryFn: async () => unwrap(await reportsInsuranceReport({ query: reportInput })),
  });
  const { data: locationsData } = useQuery<LocationsTreeResult>({
    queryKey: ['inventory', 'locations', 'tree', undefined],
    queryFn: async () => unwrap(await locationsTree()),
  });
  const { updateParam, handleLocationChange } = useSearchParamHelpers();

  return {
    locationId,
    includeChildren,
    sortBy,
    report: data?.data,
    isLoading,
    locationTree: locationsData?.data ?? [],
    updateParam,
    handleLocationChange,
  };
}
