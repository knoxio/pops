import { Package, Plus } from 'lucide-react';

import { Button, type LocationSegment, Skeleton } from '@pops/ui';

import { InventoryCard } from '../../components/InventoryCard';
import { InventoryTable } from '../../components/InventoryTable';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';
import type { Condition } from '@pops/ui';

import type { ViewMode } from './useItemsPageModel';

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

function EmptyState({
  hasSearchOrFilters,
  onAdd,
}: {
  hasSearchOrFilters: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
      <Package className="h-12 w-12 opacity-40" />
      {hasSearchOrFilters ? (
        <p>No items match your filters.</p>
      ) : (
        <>
          <p>No inventory items yet.</p>
          <Button prefix={<Plus className="h-4 w-4" />} onClick={onAdd}>
            Add your first item
          </Button>
        </>
      )}
    </div>
  );
}

function GridView({ items, onOpen }: { items: InventoryItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <InventoryCard
          key={item.id}
          id={item.id}
          itemName={item.itemName}
          assetId={item.assetId}
          type={item.type}
          condition={item.condition as Condition | null}
          locationName={item.location}
          layout="vertical"
          onClick={() => onOpen(item.id)}
        />
      ))}
    </div>
  );
}

interface ItemsContentProps {
  isLoading: boolean;
  items: InventoryItem[];
  viewMode: ViewMode;
  hasSearchOrFilters: boolean;
  locationPathMap: ReadonlyMap<string, LocationSegment[]>;
  onAdd: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDeleteRequest: (id: string) => void;
}

export function ItemsContent({
  isLoading,
  items,
  viewMode,
  hasSearchOrFilters,
  locationPathMap,
  onAdd,
  onOpen,
  onEdit,
  onDeleteRequest,
}: ItemsContentProps) {
  if (isLoading) return <ItemsPageSkeleton />;
  if (items.length === 0)
    return <EmptyState hasSearchOrFilters={hasSearchOrFilters} onAdd={onAdd} />;
  if (viewMode === 'table') {
    return (
      <InventoryTable
        items={items}
        locationPathMap={locationPathMap}
        onEdit={onEdit}
        onDeleteRequest={onDeleteRequest}
      />
    );
  }
  return <GridView items={items} onOpen={onOpen} />;
}
