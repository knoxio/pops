import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { useSetPageContext } from '@pops/navigation';
import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';
import { type SelectOption } from '@pops/ui';

import { usePillarCall } from '../../lib/pillar-call';
import {
  buildQueryInput,
  hasAnyActiveFilter,
  useItemsPageFilters,
  type Filters,
} from './useItemsPageFilters';
import {
  buildLocationPathMap,
  flattenLocations,
  type LocationTreeNodeShape,
} from './useItemsPageLocations';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

const VIEW_STORAGE_KEY = 'inventory-view-mode';

export type ViewMode = 'table' | 'grid';

export function getInitialView(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'grid' || stored === 'table') return stored;
  } catch {
    // SSR or no localStorage
  }
  return 'table';
}

export const VIEW_STORAGE = VIEW_STORAGE_KEY;

export { useItemsPageFilters };

interface DistinctTypesResult {
  data: string[];
}
interface LocationsTreeResult {
  data: LocationTreeNodeShape[];
}
interface ItemsListResult {
  data: InventoryItem[];
  pagination?: { total?: number };
  totals?: { totalReplacementValue?: number; totalResaleValue?: number };
}
interface SearchByAssetIdResult {
  data: { id: string } | null;
}
interface DeleteItemInput {
  id: string;
}

function useItemsPageOptions() {
  const { data: typesData } = usePillarQuery<DistinctTypesResult>(
    'inventory',
    ['items', 'distinctTypes'],
    undefined
  );
  const typeOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All Types' }];
    for (const t of typesData?.data ?? []) opts.push({ value: t, label: t });
    return opts;
  }, [typesData]);

  const { data: locationsData } = usePillarQuery<LocationsTreeResult>(
    'inventory',
    ['locations', 'tree'],
    undefined
  );
  const locationOptions = useMemo(
    () => flattenLocations(locationsData?.data ?? []),
    [locationsData]
  );
  const locationPathMap = useMemo(
    () => buildLocationPathMap(locationsData?.data ?? []),
    [locationsData]
  );
  return { typeOptions, locationOptions, locationPathMap };
}

function useAssetIdSearchHandler(filters: Filters) {
  const navigate = useNavigate();
  const pillarCall = usePillarCall();
  const [, setAssetIdSearching] = useState(false);
  return useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || !filters.search.trim()) return;
      setAssetIdSearching(true);
      try {
        const result = await pillarCall<SearchByAssetIdResult>(
          'inventory',
          ['items', 'searchByAssetId'],
          { assetId: filters.search.trim() }
        );
        if (result.kind === 'ok' && result.value.data) {
          void navigate(`/inventory/items/${result.value.data.id}`);
        }
      } finally {
        setAssetIdSearching(false);
      }
    },
    [filters.search, pillarCall, navigate]
  );
}

function summarize(data: ItemsListResult | undefined) {
  return {
    items: data?.data ?? [],
    totalCount: data?.pagination?.total ?? 0,
    totalReplacementValue: data?.totals?.totalReplacementValue ?? 0,
    totalResaleValue: data?.totals?.totalResaleValue ?? 0,
  };
}

function useItemsPageContext(filters: Filters): void {
  const itemsFilters = useMemo(
    () => ({
      ...(filters.search && { search: filters.search }),
      ...(filters.typeFilter && { type: filters.typeFilter }),
      ...(filters.conditionFilter && { condition: filters.conditionFilter }),
      ...(filters.locationFilter && { locationId: filters.locationFilter }),
    }),
    [filters.search, filters.typeFilter, filters.conditionFilter, filters.locationFilter]
  );
  useSetPageContext({ page: 'items', filters: itemsFilters });
}

export function useItemsPageModel() {
  const navigate = useNavigate();
  const filters = useItemsPageFilters();
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialView);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  useItemsPageContext(filters);
  const { typeOptions, locationOptions, locationPathMap } = useItemsPageOptions();
  const handleSearchKeyDown = useAssetIdSearchHandler(filters);

  const queryInput = useMemo(() => buildQueryInput(filters), [filters]);
  const { data, isLoading } = usePillarQuery<ItemsListResult>(
    'inventory',
    ['items', 'list'],
    queryInput
  );
  const summary = summarize(data);

  const deleteMutation = usePillarMutation<DeleteItemInput, unknown>(
    'inventory',
    ['items', 'delete'],
    {
      onSuccess: () => {
        setDeletingItemId(null);
      },
    }
  );

  return {
    navigate,
    filters,
    viewMode,
    setViewMode,
    typeOptions,
    locationOptions,
    locationPathMap,
    handleSearchKeyDown,
    ...summary,
    isLoading,
    hasActiveFilters: hasAnyActiveFilter(filters),
    deletingItemId,
    setDeletingItemId,
    deleteMutation,
  };
}
