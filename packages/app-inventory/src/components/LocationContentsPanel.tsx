import { Package, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { trpc } from '@pops/api-client';
import { AssetIdBadge, Button, ContainerPanel, formatAUD, Skeleton, TypeBadge } from '@pops/ui';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: LocationTreeNode[];
}

function collectDescendantIds(node: LocationTreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

export interface LocationContentsPanelProps {
  locationId: string;
  locationName: string;
  breadcrumb: string[];
  node: LocationTreeNode;
}

function useLocationItems(
  locationId: string,
  descendantIds: string[],
  includeSubLocations: boolean
) {
  const hasSubLocations = descendantIds.length > 0;
  const { data: directData, isLoading: directLoading } = trpc.inventory.items.list.useQuery({
    locationId,
    limit: 200,
  });
  const subLocationQueries = trpc.useQueries((t) =>
    includeSubLocations && hasSubLocations
      ? descendantIds.map((id) => t.inventory.items.list({ locationId: id, limit: 200 }))
      : []
  );

  const subLocationItems = useMemo(() => {
    if (!includeSubLocations || !hasSubLocations) return [];
    return subLocationQueries.flatMap((q) => q.data?.data ?? []);
  }, [includeSubLocations, hasSubLocations, subLocationQueries]);

  const allItems = useMemo(() => {
    const direct = directData?.data ?? [];
    if (!includeSubLocations) return direct;
    return [...direct, ...subLocationItems];
  }, [directData, includeSubLocations, subLocationItems]);

  const isLoading =
    directLoading ||
    (includeSubLocations && hasSubLocations && subLocationQueries.some((q) => q.isLoading));

  return { allItems, isLoading, hasSubLocations };
}

function ItemsList({
  items,
  onItemClick,
}: {
  items: InventoryItem[];
  onItemClick: (id: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-auto px-2 py-1.5 text-left"
            onClick={() => onItemClick(item.id)}
          >
            <span className="font-medium truncate flex-1">{item.itemName}</span>
            {item.assetId && <AssetIdBadge assetId={item.assetId} />}
            {item.type && <TypeBadge type={item.type} />}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ItemsBody({
  isLoading,
  items,
  onItemClick,
}: {
  isLoading: boolean;
  items: InventoryItem[];
  onItemClick: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return null;
  return <ItemsList items={items} onItemClick={onItemClick} />;
}

const EMPTY_STATE = (
  <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
    <Package className="h-8 w-8 opacity-40" />
    <p className="text-sm">No items at this location.</p>
  </div>
);

function PanelSummary({
  isLoading,
  count,
  totalValue,
}: {
  isLoading: boolean;
  count: number;
  totalValue: number;
}) {
  if (isLoading) return <Skeleton className="h-4 w-36" />;
  return (
    <>
      {count} {count === 1 ? 'item' : 'items'}
      {totalValue > 0 && <span> · {formatAUD(totalValue)}</span>}
    </>
  );
}

export function LocationContentsPanel({
  locationId,
  locationName,
  breadcrumb,
  node,
}: LocationContentsPanelProps) {
  const navigate = useNavigate();
  const [includeSubLocations, setIncludeSubLocations] = useState(true);
  const descendantIds = useMemo(() => collectDescendantIds(node), [node]);
  const { allItems, isLoading, hasSubLocations } = useLocationItems(
    locationId,
    descendantIds,
    includeSubLocations
  );
  const totalValue = useMemo(
    () =>
      allItems.reduce((sum: number, item: InventoryItem) => sum + (item.replacementValue ?? 0), 0),
    [allItems]
  );
  const toggle = hasSubLocations
    ? {
        label: 'Include sub-locations',
        value: includeSubLocations,
        onChange: setIncludeSubLocations,
        id: 'include-sub',
      }
    : undefined;

  return (
    <ContainerPanel
      title={locationName}
      subtitle={breadcrumb.join(' / ')}
      toggle={toggle}
      summary={
        <PanelSummary isLoading={isLoading} count={allItems.length} totalValue={totalValue} />
      }
      emptyState={!isLoading && allItems.length === 0 ? EMPTY_STATE : undefined}
      action={
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            navigate(`/inventory/items/new?locationId=${encodeURIComponent(locationId)}`)
          }
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Item Here
        </Button>
      }
    >
      <ItemsBody
        isLoading={isLoading}
        items={allItems}
        onItemClick={(id) => navigate(`/inventory/items/${id}`)}
      />
    </ContainerPanel>
  );
}
