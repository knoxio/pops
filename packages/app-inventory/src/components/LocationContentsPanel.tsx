import { Package, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

/**
 * LocationContentsPanel — shows inventory items at a selected location.
 *
 * Displays item list with name, asset ID badge, and type badge.
 * Supports "Include sub-locations" toggle, shows item count + total value,
 * and provides navigation to item detail and item creation.
 */
import { AssetIdBadge, Button, Label, Skeleton, Switch, TypeBadge } from '@pops/ui';

import { trpc } from '../lib/trpc';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: LocationTreeNode[];
}

/** Collect all descendant location IDs (excluding the node itself). */
function collectDescendantIds(node: LocationTreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export interface LocationContentsPanelProps {
  locationId: string;
  locationName: string;
  breadcrumb: string[];
  node: LocationTreeNode;
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
  const hasSubLocations = descendantIds.length > 0;

  // Query items for this location
  const { data: directData, isLoading: directLoading } = trpc.inventory.items.list.useQuery({
    locationId,
    limit: 200,
  });

  // Query items for sub-locations (only when toggled on and sub-locations exist)
  const subLocationQueries = trpc.useQueries((t) =>
    includeSubLocations && hasSubLocations
      ? descendantIds.map((id) => t.inventory.items.list({ locationId: id, limit: 200 }))
      : []
  );

  const subLocationItems = useMemo(() => {
    if (!includeSubLocations || !hasSubLocations) return [];
    return subLocationQueries.flatMap((q) => q.data?.data ?? []);
  }, [includeSubLocations, hasSubLocations, subLocationQueries]);

  const isLoading =
    directLoading ||
    (includeSubLocations && hasSubLocations && subLocationQueries.some((q) => q.isLoading));

  const allItems = useMemo(() => {
    const direct = directData?.data ?? [];
    if (!includeSubLocations) return direct;
    return [...direct, ...subLocationItems];
  }, [directData, includeSubLocations, subLocationItems]);

  const totalValue = useMemo(
    () =>
      allItems.reduce((sum: number, item: InventoryItem) => sum + (item.replacementValue ?? 0), 0),
    [allItems]
  );

  return (
    <div className="border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div>
        <p className="text-xs text-muted-foreground">{breadcrumb.join(' / ')}</p>
        <h2 className="text-lg font-semibold mt-1">{locationName}</h2>
      </div>

      {/* Sub-locations toggle */}
      {hasSubLocations && (
        <div className="flex items-center gap-2">
          <Switch
            id="include-sub"
            checked={includeSubLocations}
            onCheckedChange={setIncludeSubLocations}
          />
          <Label htmlFor="include-sub" className="text-sm">
            Include sub-locations
          </Label>
        </div>
      )}

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {isLoading ? (
          <Skeleton className="h-4 w-36" />
        ) : (
          <>
            {allItems.length} {allItems.length === 1 ? 'item' : 'items'}
            {totalValue > 0 && <span> · {formatCurrency(totalValue)}</span>}
          </>
        )}
      </div>

      {/* Item list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : allItems.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
          <Package className="h-8 w-8 opacity-40" />
          <p className="text-sm">No items at this location.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {allItems.map((item: InventoryItem) => (
            <li key={item.id}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 h-auto px-2 py-1.5 text-left"
                onClick={() => navigate(`/inventory/items/${item.id}`)}
              >
                <span className="font-medium truncate flex-1">{item.itemName}</span>
                {item.assetId && <AssetIdBadge assetId={item.assetId} />}
                {item.type && <TypeBadge type={item.type} />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add Item Here */}
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
    </div>
  );
}
