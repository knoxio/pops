import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { useSetPageContext } from '@pops/navigation';
import { type SelectOption } from '@pops/ui';

import { unwrap } from '../../inventory-api-helpers.js';
import {
  itemsDelete,
  itemsDistinctTypes,
  itemsList,
  itemsSearchByAssetId,
  locationsTree,
} from '../../inventory-api/index.js';
import {
  buildQueryInput,
  hasAnyActiveFilter,
  useItemsPageFilters,
  type Filters,
} from './useItemsPageFilters';
import { buildLocationPathMap, flattenLocations } from './useItemsPageLocations';

import type { ItemsListResponses } from '../../inventory-api/types.gen.js';

type InventoryItem = ItemsListResponses['200']['data'][number];

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

interface ItemsListResult {
  data: InventoryItem[];
  pagination?: { total?: number };
  totals?: { totalReplacementValue?: number; totalResaleValue?: number };
}
interface DeleteItemInput {
  id: string;
}

function useItemsPageOptions() {
  const { data: typesData } = useQuery({
    queryKey: ['inventory', 'items', 'distinctTypes', undefined],
    queryFn: async () => unwrap(await itemsDistinctTypes()),
  });
  const typeOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All Types' }];
    for (const t of typesData?.data ?? []) opts.push({ value: t, label: t });
    return opts;
  }, [typesData]);

  const { data: locationsData } = useQuery({
    queryKey: ['inventory', 'locations', 'tree', undefined],
    queryFn: async () => unwrap(await locationsTree()),
  });
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
  const [, setAssetIdSearching] = useState(false);
  return useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || !filters.search.trim()) return;
      setAssetIdSearching(true);
      try {
        const result = await itemsSearchByAssetId({ query: { assetId: filters.search.trim() } });
        const value = unwrap(result);
        if (value.data) {
          void navigate(`/inventory/items/${value.data.id}`);
        }
      } catch {
        // swallow: a failed lookup leaves the user on the list view
      } finally {
        setAssetIdSearching(false);
      }
    },
    [filters.search, navigate]
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
  const queryClient = useQueryClient();
  const filters = useItemsPageFilters();
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialView);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  useItemsPageContext(filters);
  const { typeOptions, locationOptions, locationPathMap } = useItemsPageOptions();
  const handleSearchKeyDown = useAssetIdSearchHandler(filters);

  const queryInput = useMemo(() => buildQueryInput(filters), [filters]);
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'items', 'list', queryInput],
    queryFn: async () => unwrap(await itemsList({ query: queryInput })),
  });
  const summary = summarize(data);

  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteItemInput) =>
      unwrap(await itemsDelete({ path: { id: input.id } })),
    onSuccess: () => {
      setDeletingItemId(null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] }),
  });

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
