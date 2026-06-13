import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { useSetPageContext } from '@pops/navigation';
import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';

import type { ItemConnection } from '@pops/api/modules/inventory/connections/types';

interface ItemRecord {
  id: string;
  itemName: string;
  brand: string | null;
  model: string | null;
  type: string | null;
  condition: string | null;
  warrantyExpires: string | null;
  room: string | null;
  assetId: string | null;
  inUse: boolean;
  purchaseDate: string | null;
  replacementValue: number | null;
  locationId: string | null;
  purchaseTransactionId: string | null;
  purchasedFromId: string | null;
  purchasedFromName: string | null;
  notes: string | null;
}

interface ItemQueryResult {
  data: ItemRecord | null;
}

interface LocationPathResult {
  data: Array<{ id: string; name: string }>;
}

interface ConnectionsResult {
  data: ItemConnection[];
}

interface PhotosResult {
  data: Array<{ id: number; filePath: string; caption: string | null; sortOrder: number }>;
  pagination?: { total: number; limit: number; offset: number; hasMore: boolean };
}

interface DeleteItemInput {
  id: string;
}

interface DisconnectInput {
  itemAId: string;
  itemBId: string;
}

interface ReorderPhotosInput {
  itemId: string;
  orderedIds: number[];
}

function useItemDetailMutations(id: string | undefined) {
  const navigate = useNavigate();

  const deleteMutation = usePillarMutation<DeleteItemInput, unknown>(
    'inventory',
    ['items', 'delete'],
    {
      onSuccess: () => {
        toast.success('Item deleted');
        void navigate('/inventory');
      },
      onError: (err) => toast.error(`Failed to delete: ${err.message}`),
    }
  );

  const disconnectMutation = usePillarMutation<DisconnectInput, unknown>(
    'inventory',
    ['connections', 'disconnect'],
    {
      onSuccess: () => {
        toast.success('Items disconnected');
      },
      onError: (err) => toast.error(`Failed to disconnect: ${err.message}`),
    }
  );

  const reorderPhotosMutation = usePillarMutation<ReorderPhotosInput, unknown>(
    'inventory',
    ['photos', 'reorder'],
    {
      onError: (err) => toast.error(`Failed to reorder photos: ${err.message}`),
    }
  );

  return { deleteMutation, disconnectMutation, reorderPhotosMutation, id };
}

export function useItemDetailPageModel() {
  const { id } = useParams<{ id: string }>();
  const {
    data: itemData,
    isLoading,
    error,
  } = usePillarQuery<ItemQueryResult>(
    'inventory',
    ['items', 'get'],
    { id: id ?? '' },
    { enabled: !!id }
  );
  const locationId = itemData?.data?.locationId ?? null;

  const { data: locationPathData } = usePillarQuery<LocationPathResult>(
    'inventory',
    ['locations', 'getPath'],
    { id: locationId ?? '' },
    { enabled: !!locationId }
  );
  const { data: connectionsData, isLoading: connectionsLoading } =
    usePillarQuery<ConnectionsResult>(
      'inventory',
      ['connections', 'listForItem'],
      { itemId: id ?? '' },
      { enabled: !!id }
    );
  const { data: photosData, isLoading: photosLoading } = usePillarQuery<PhotosResult>(
    'inventory',
    ['photos', 'listForItem'],
    { itemId: id ?? '' },
    { enabled: !!id }
  );
  const { deleteMutation, disconnectMutation, reorderPhotosMutation } = useItemDetailMutations(id);

  const itemEntity = useMemo(
    () => ({
      uri: `pops:inventory/item/${id ?? ''}`,
      type: 'item' as const,
      title: itemData?.data?.itemName ?? '',
    }),
    [id, itemData?.data?.itemName]
  );
  useSetPageContext({ page: 'item-detail', pageType: 'drill-down', entity: itemEntity });

  return {
    id,
    itemData,
    isLoading,
    error,
    locationPath: locationPathData?.data ?? null,
    connectionsData,
    connectionsLoading,
    photosData,
    photosLoading,
    reorderPhotosMutation,
    deleteMutation,
    disconnectMutation,
  };
}
