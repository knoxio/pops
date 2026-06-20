import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { useSetPageContext } from '@pops/navigation';

import { unwrap } from '../../inventory-api-helpers.js';
import {
  connectionsDisconnect,
  connectionsListForItem,
  itemsDelete,
  itemsGet,
  locationsGetPath,
  photosListForItem,
  photosReorder,
} from '../../inventory-api/index.js';

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
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteItemInput) =>
      unwrap(await itemsDelete({ path: { id: input.id } })),
    onSuccess: () => {
      toast.success('Item deleted');
      void navigate('/inventory');
    },
    onError: (err: Error) => toast.error(`Failed to delete: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (input: DisconnectInput) =>
      unwrap(
        await connectionsDisconnect({
          query: { itemAId: input.itemAId, itemBId: input.itemBId },
        })
      ),
    onSuccess: () => {
      toast.success('Items disconnected');
    },
    onError: (err: Error) => toast.error(`Failed to disconnect: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'connections'] }),
  });

  const reorderPhotosMutation = useMutation({
    mutationFn: async (input: ReorderPhotosInput) =>
      unwrap(
        await photosReorder({
          path: { itemId: input.itemId },
          body: { orderedIds: input.orderedIds },
        })
      ),
    onError: (err: Error) => toast.error(`Failed to reorder photos: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'photos'] }),
  });

  return { deleteMutation, disconnectMutation, reorderPhotosMutation, id };
}

export function useItemDetailPageModel() {
  const { id } = useParams<{ id: string }>();
  const itemInput = { id: id ?? '' };
  const {
    data: itemData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inventory', 'items', 'get', itemInput],
    queryFn: async () => unwrap(await itemsGet({ path: { id: id ?? '' } })),
    enabled: !!id,
  });
  const locationId = itemData?.data?.locationId ?? null;

  const { data: locationPathData } = useQuery({
    queryKey: ['inventory', 'locations', 'getPath', { id: locationId ?? '' }],
    queryFn: async () => unwrap(await locationsGetPath({ path: { id: locationId ?? '' } })),
    enabled: !!locationId,
  });
  const { data: connectionsData, isLoading: connectionsLoading } = useQuery({
    queryKey: ['inventory', 'connections', 'listForItem', { itemId: id ?? '' }],
    queryFn: async () => unwrap(await connectionsListForItem({ path: { itemId: id ?? '' } })),
    enabled: !!id,
  });
  const { data: photosData, isLoading: photosLoading } = useQuery({
    queryKey: ['inventory', 'photos', 'listForItem', { itemId: id ?? '' }],
    queryFn: async () => unwrap(await photosListForItem({ path: { itemId: id ?? '' } })),
    enabled: !!id,
  });
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
