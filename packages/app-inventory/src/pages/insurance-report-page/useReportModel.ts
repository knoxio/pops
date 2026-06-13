import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';

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

  const { data, isLoading } = usePillarQuery<InsuranceReportResult>(
    'inventory',
    ['reports', 'insuranceReport'],
    { locationId, includeChildren: locationId ? includeChildren : undefined, sortBy }
  );
  const { data: locationsData } = usePillarQuery<LocationsTreeResult>(
    'inventory',
    ['locations', 'tree'],
    undefined
  );
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
