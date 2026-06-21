import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../inventory-api-helpers.js';
import { itemsList } from '../inventory-api/index.js';

import type { ItemsListResponse } from '../inventory-api/index.js';

export type InventoryItem = ItemsListResponse['data'][number];

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
  const directInput = { locationId, limit: 200 };
  const { data: directData, isLoading: directLoading } = useQuery({
    queryKey: ['inventory', 'items', 'list', directInput],
    queryFn: async () => unwrap(await itemsList({ query: directInput })),
  });

  const subLocationQueries = useQueries({
    queries:
      includeSubLocations && hasSubLocations
        ? descendantIds.map((id) => {
            const input = { locationId: id, limit: 200 };
            return {
              queryKey: ['inventory', 'items', 'list', input],
              queryFn: async () => unwrap(await itemsList({ query: input })),
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
