import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { useSetPageContext } from '@pops/navigation';

export function useItemDetailPageModel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const {
    data: itemData,
    isLoading,
    error,
  } = trpc.inventory.items.get.useQuery({ id: id ?? '' }, { enabled: !!id });

  const locationId = itemData?.data?.locationId ?? null;

  const { data: locationPathData } = trpc.inventory.locations.getPath.useQuery(
    { id: locationId ?? '' },
    { enabled: !!locationId }
  );

  const { data: connectionsData, isLoading: connectionsLoading } =
    trpc.inventory.connections.listForItem.useQuery({ itemId: id ?? '' }, { enabled: !!id });

  const { data: photosData, isLoading: photosLoading } = trpc.inventory.photos.listForItem.useQuery(
    { itemId: id ?? '' },
    { enabled: !!id }
  );

  const deleteMutation = trpc.inventory.items.delete.useMutation({
    onSuccess: () => {
      toast.success('Item deleted');
      void navigate('/inventory');
    },
    onError: (err) => toast.error(`Failed to delete: ${err.message}`),
  });

  const disconnectMutation = trpc.inventory.connections.disconnect.useMutation({
    onSuccess: () => {
      toast.success('Items disconnected');
      void utils.inventory.connections.listForItem.invalidate({ itemId: id ?? '' });
    },
    onError: (err) => toast.error(`Failed to disconnect: ${err.message}`),
  });

  const reorderPhotosMutation = trpc.inventory.photos.reorder.useMutation({
    onSuccess: () => void utils.inventory.photos.listForItem.invalidate({ itemId: id ?? '' }),
    onError: (err) => toast.error(`Failed to reorder photos: ${err.message}`),
  });

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
    utils,
  };
}
