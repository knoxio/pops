import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { pillar, PillarCallError } from '@pops/pillar-sdk/client';
import { pillarQueryKey, usePillarQuery, usePillarSdkOptions } from '@pops/pillar-sdk/react';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

export interface ItemsListResult {
  data: InventoryItem[];
}

export interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: LocationTreeNode[];
}

export function collectDescendantIds(node: LocationTreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

export function useLocationItems(
  locationId: string,
  descendantIds: string[],
  includeSubLocations: boolean
) {
  const hasSubLocations = descendantIds.length > 0;
  const sdkOptions = usePillarSdkOptions();
  const { data: directData, isLoading: directLoading } = usePillarQuery<ItemsListResult>(
    'inventory',
    ['items', 'list'],
    { locationId, limit: 200 }
  );

  const subLocationQueries = useQueries({
    queries:
      includeSubLocations && hasSubLocations
        ? descendantIds.map((id) => {
            const input = { locationId: id, limit: 200 };
            return {
              queryKey: pillarQueryKey('inventory', ['items', 'list'], input),
              queryFn: async (): Promise<ItemsListResult> => {
                const handle = pillar<{
                  items: { list: (i: unknown) => Promise<unknown> };
                }>('inventory', sdkOptions);
                const result = await handle.items.list(input);
                if (result.kind === 'ok') return result.value as ItemsListResult;
                throw new PillarCallError('inventory', result);
              },
            };
          })
        : [],
  });

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
