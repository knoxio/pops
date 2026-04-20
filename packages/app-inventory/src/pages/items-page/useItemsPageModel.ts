import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { trpc } from '@pops/api-client';
import { useSetPageContext } from '@pops/navigation';
import { type LocationSegment, type SelectOption, useDebouncedValue } from '@pops/ui';

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

type TreeNode = { id: string; name: string; children: TreeNode[] };

function flattenLocations(nodes: TreeNode[]): SelectOption[] {
  const opts: SelectOption[] = [{ value: '', label: 'All Locations' }];
  function walk(items: TreeNode[], depth: number): void {
    for (const node of items) {
      const indent = depth > 0 ? '\u00A0\u00A0'.repeat(depth) + '└ ' : '';
      opts.push({ value: node.id, label: `${indent}${node.name}` });
      walk(node.children, depth + 1);
    }
  }
  walk(nodes, 0);
  return opts;
}

function buildLocationPathMap(nodes: TreeNode[]): ReadonlyMap<string, LocationSegment[]> {
  const map = new Map<string, LocationSegment[]>();
  function walk(items: TreeNode[], ancestors: LocationSegment[]): void {
    for (const node of items) {
      const path = [...ancestors, { id: node.id, name: node.name }];
      map.set(node.id, path);
      walk(node.children, path);
    }
  }
  walk(nodes, []);
  return map;
}

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

type Filters = ReturnType<typeof useItemsPageFilters>;

function useItemsPageOptions() {
  const { data: typesData } = trpc.inventory.items.distinctTypes.useQuery();
  const typeOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All Types' }];
    for (const t of typesData?.data ?? []) opts.push({ value: t, label: t });
    return opts;
  }, [typesData]);

  const { data: locationsData } = trpc.inventory.locations.tree.useQuery();
  const locationOptions = useMemo(
    () => flattenLocations((locationsData?.data ?? []) as TreeNode[]),
    [locationsData]
  );
  const locationPathMap = useMemo(
    () => buildLocationPathMap((locationsData?.data ?? []) as TreeNode[]),
    [locationsData]
  );
  return { typeOptions, locationOptions, locationPathMap };
}

function useAssetIdSearchHandler(filters: Filters) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [, setAssetIdSearching] = useState(false);
  return useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || !filters.search.trim()) return;
      setAssetIdSearching(true);
      try {
        const result = await utils.inventory.items.searchByAssetId.fetch({
          assetId: filters.search.trim(),
        });
        if (result.data) navigate(`/inventory/items/${result.data.id}`);
      } finally {
        setAssetIdSearching(false);
      }
    },
    [filters.search, utils, navigate]
  );
}

function buildQueryInput(filters: Filters) {
  return {
    search: filters.debouncedSearch || undefined,
    type: filters.typeFilter || undefined,
    condition: filters.conditionFilter || undefined,
    inUse: (filters.inUseFilter || undefined) as 'true' | 'false' | undefined,
    locationId: filters.locationFilter || undefined,
    limit: 200,
  };
}

function hasAnyActiveFilter(filters: Filters): boolean {
  return Boolean(
    filters.typeFilter || filters.conditionFilter || filters.inUseFilter || filters.locationFilter
  );
}

interface ItemsQueryData {
  data?: unknown[];
  pagination?: { total?: number };
  totals?: { totalReplacementValue?: number; totalResaleValue?: number };
}

function summarize(data: unknown) {
  const d = data as ItemsQueryData | undefined;
  return {
    items: (d?.data ?? []) as InventoryItem[],
    totalCount: d?.pagination?.total ?? 0,
    totalReplacementValue: d?.totals?.totalReplacementValue ?? 0,
    totalResaleValue: d?.totals?.totalResaleValue ?? 0,
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

  useItemsPageContext(filters);
  const { typeOptions, locationOptions, locationPathMap } = useItemsPageOptions();
  const handleSearchKeyDown = useAssetIdSearchHandler(filters);

  const queryInput = useMemo(() => buildQueryInput(filters), [filters]);
  const { data, isLoading } = trpc.inventory.items.list.useQuery(queryInput);
  const summary = summarize(data);

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
  };
}
