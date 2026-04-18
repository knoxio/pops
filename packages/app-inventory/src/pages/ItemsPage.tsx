import { LayoutGrid, LayoutList, Package, Plus, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

/**
 * ItemsPage — inventory item list with search, filters, table/grid toggle,
 * and summary statistics. PRD-019/US-2.
 */
import { useSetPageContext } from '@pops/navigation';
import {
  Button,
  type LocationSegment,
  PageHeader,
  Select,
  type SelectOption,
  Skeleton,
  TextInput,
  useDebouncedValue,
  ViewToggleGroup,
} from '@pops/ui';

import { InventoryCard } from '../components/InventoryCard';
import { InventoryTable } from '../components/InventoryTable';
import { trpc } from '../lib/trpc';
import { formatCurrency } from '../lib/utils';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';
import type { Condition } from '@pops/ui';

type ViewMode = 'table' | 'grid';

const VIEW_STORAGE_KEY = 'inventory-view-mode';

const VIEW_OPTIONS = [
  { value: 'table' as const, label: 'Table view', icon: <LayoutList className="h-4 w-4" /> },
  { value: 'grid' as const, label: 'Grid view', icon: <LayoutGrid className="h-4 w-4" /> },
];

function getInitialView(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'grid' || stored === 'table') return stored;
  } catch {
    // SSR or no localStorage
  }
  return 'table';
}

const CONDITION_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Conditions' },
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'broken', label: 'Broken' },
];

const IN_USE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All' },
  { value: 'true', label: 'In Use' },
  { value: 'false', label: 'Not In Use' },
];

function ItemsPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="h-4 w-48" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ItemsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialView);

  const search = searchParams.get('q') ?? '';
  const debouncedSearch = useDebouncedValue(search, 300);
  const typeFilter = searchParams.get('type') ?? '';
  const conditionFilter = searchParams.get('condition') ?? '';
  const inUseFilter = searchParams.get('inUse') ?? '';
  const locationFilter = searchParams.get('locationId') ?? '';

  const itemsFilters = useMemo(
    () => ({
      ...(search && { search }),
      ...(typeFilter && { type: typeFilter }),
      ...(conditionFilter && { condition: conditionFilter }),
      ...(locationFilter && { locationId: locationFilter }),
    }),
    [search, typeFilter, conditionFilter, locationFilter]
  );
  useSetPageContext({ page: 'items', filters: itemsFilters });

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
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

  /** Dynamic type options from the database. */
  const { data: typesData } = trpc.inventory.items.distinctTypes.useQuery();
  const typeOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All Types' }];
    for (const t of typesData?.data ?? []) {
      opts.push({ value: t, label: t });
    }
    return opts;
  }, [typesData]);

  /** Location options from the tree endpoint — indented to show hierarchy. */
  const { data: locationsData } = trpc.inventory.locations.tree.useQuery();
  const locationOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All Locations' }];
    function flatten(
      nodes: Array<{ id: string; name: string; children: Array<unknown> }>,
      depth: number
    ) {
      for (const node of nodes) {
        const indent = depth > 0 ? '\u00A0\u00A0'.repeat(depth) + '└ ' : '';
        opts.push({ value: node.id, label: `${indent}${node.name}` });
        flatten(node.children as typeof nodes, depth + 1);
      }
    }
    flatten(locationsData?.data ?? [], 0);
    return opts;
  }, [locationsData]);

  /**
   * locationPathMap — derived from the tree, maps every locationId to its
   * root-first breadcrumb segments. Used by InventoryTable for the Location
   * column so the table renders breadcrumbs without per-row queries.
   */
  const locationPathMap = useMemo<ReadonlyMap<string, LocationSegment[]>>(() => {
    const map = new Map<string, LocationSegment[]>();

    type TreeNode = { id: string; name: string; children: TreeNode[] };

    function walk(nodes: TreeNode[], ancestors: LocationSegment[]) {
      for (const node of nodes) {
        const path = [...ancestors, { id: node.id, name: node.name }];
        map.set(node.id, path);
        walk(node.children, path);
      }
    }

    walk((locationsData?.data ?? []) as TreeNode[], []);
    return map;
  }, [locationsData]);

  /** Asset ID exact-match search on Enter key. */
  const utils = trpc.useUtils();
  const [_assetIdSearching, setAssetIdSearching] = useState(false);
  const handleSearchKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || !search.trim()) return;
      setAssetIdSearching(true);
      try {
        const result = await utils.inventory.items.searchByAssetId.fetch({
          assetId: search.trim(),
        });
        if (result.data) {
          navigate(`/inventory/items/${result.data.id}`);
        }
      } finally {
        setAssetIdSearching(false);
      }
    },
    [search, utils, navigate]
  );

  const queryInput = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      type: typeFilter || undefined,
      condition: conditionFilter || undefined,
      inUse: (inUseFilter || undefined) as 'true' | 'false' | undefined,
      locationId: locationFilter || undefined,
      limit: 200,
    }),
    [debouncedSearch, typeFilter, conditionFilter, inUseFilter, locationFilter]
  );

  const { data, isLoading } = trpc.inventory.items.list.useQuery(queryInput);

  const items = data?.data ?? [];
  const totalCount = data?.pagination?.total ?? 0;
  const totalReplacementValue = data?.totals?.totalReplacementValue ?? 0;
  const totalResaleValue = data?.totals?.totalResaleValue ?? 0;

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
  };

  const hasActiveFilters = !!(typeFilter || conditionFilter || inUseFilter || locationFilter);

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" />

      {/* Search + Filters + View Toggle */}
      <div className="flex flex-wrap items-end gap-3">
        <TextInput
          placeholder="Search items or asset IDs..."
          prefix={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => {
            setParam('q', e.target.value);
          }}
          onKeyDown={handleSearchKeyDown}
          clearable
          onClear={() => {
            setParam('q', '');
          }}
          className="w-full sm:max-w-xs"
        />
        <Select
          value={typeFilter}
          onChange={(e) => {
            setParam('type', e.target.value);
          }}
          options={typeOptions}
          placeholder="All Types"
          className="w-36"
        />
        <Select
          value={conditionFilter}
          onChange={(e) => {
            setParam('condition', e.target.value);
          }}
          options={CONDITION_OPTIONS}
          placeholder="All Conditions"
          className="w-40"
        />
        <Select
          value={inUseFilter}
          onChange={(e) => {
            setParam('inUse', e.target.value);
          }}
          options={IN_USE_OPTIONS}
          placeholder="All"
          className="w-28"
        />
        <Select
          value={locationFilter}
          onChange={(e) => {
            setParam('locationId', e.target.value);
          }}
          options={locationOptions}
          placeholder="All Locations"
          className="w-40"
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Summary line + View Toggle */}
      {!isLoading && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-app-accent/10 px-3 py-1.5">
            <Package className="h-4 w-4 text-app-accent" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
              {totalCount} {totalCount === 1 ? 'item' : 'items'}
              {totalReplacementValue > 0 && (
                <span> — {formatCurrency(totalReplacementValue)} replacement</span>
              )}
              {totalResaleValue > 0 && <span> — {formatCurrency(totalResaleValue)} resale</span>}
            </p>
          </div>
          <ViewToggleGroup
            options={VIEW_OPTIONS}
            value={viewMode}
            onChange={handleViewChange}
            storageKey={VIEW_STORAGE_KEY}
            className="ml-auto"
          />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <ItemsPageSkeleton />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
          <Package className="h-12 w-12 opacity-40" />
          {search || hasActiveFilters ? (
            <p>No items match your filters.</p>
          ) : (
            <>
              <p>No inventory items yet.</p>
              <Button
                prefix={<Plus className="h-4 w-4" />}
                onClick={() => navigate('/inventory/items/new')}
              >
                Add your first item
              </Button>
            </>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <InventoryTable items={items} locationPathMap={locationPathMap} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item: InventoryItem) => (
            <InventoryCard
              key={item.id}
              id={item.id}
              itemName={item.itemName}
              assetId={item.assetId}
              type={item.type}
              condition={item.condition as Condition | null}
              locationName={item.location}
              layout="vertical"
              onClick={() => navigate(`/inventory/items/${item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
