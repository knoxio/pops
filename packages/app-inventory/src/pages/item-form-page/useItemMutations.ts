import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { unwrap } from '../../inventory-api-helpers.js';
import { connectionsConnect, itemsCreate, itemsUpdate } from '../../inventory-api/index.js';

import type { ItemFormValues, PendingConnection } from './types';

interface ConnectInput {
  itemAId: string;
  itemBId: string;
}

interface ConnectMutation {
  mutateAsync: (input: ConnectInput) => Promise<unknown>;
}

async function applyConnections(
  newItemId: string,
  pendingConnections: PendingConnection[],
  connectMutation: ConnectMutation
): Promise<number> {
  let connected = 0;
  for (const conn of pendingConnections) {
    try {
      await connectMutation.mutateAsync({ itemAId: newItemId, itemBId: conn.id });
      connected++;
    } catch {
      /* skip */
    }
  }
  return connected;
}

function reportCreateSuccess(connected: number, hasPending: boolean): void {
  if (hasPending) {
    toast.success(
      connected > 0
        ? `Item created with ${connected} connection${connected > 1 ? 's' : ''}`
        : 'Item created'
    );
  } else {
    toast.success('Item created');
  }
}

function parseNumber(v: string): number | null {
  return v ? parseFloat(v) : null;
}

interface ItemPayload {
  itemName: string;
  brand: string | null;
  model: string | null;
  itemId: string | null;
  type: string | null;
  condition: string | null;
  room: null;
  locationId: string | null;
  inUse: boolean;
  deductible: boolean;
  purchaseDate: string | null;
  warrantyExpires: string | null;
  purchasePrice: number | null;
  replacementValue: number | null;
  resaleValue: number | null;
  assetId: string | null;
  notes: string | null;
}

function buildItemPayload(values: ItemFormValues): ItemPayload {
  return {
    itemName: values.itemName.trim(),
    brand: values.brand || null,
    model: values.model || null,
    itemId: values.itemId || null,
    type: values.type || null,
    condition: values.condition || null,
    room: null,
    locationId: values.locationId || null,
    inUse: values.inUse,
    deductible: values.deductible,
    purchaseDate: values.purchaseDate || null,
    warrantyExpires: values.warrantyExpires || null,
    purchasePrice: parseNumber(values.purchasePrice),
    replacementValue: parseNumber(values.replacementValue),
    resaleValue: parseNumber(values.resaleValue),
    assetId: values.assetId || null,
    notes: values.notes || null,
  };
}

interface UseItemMutationsArgs {
  id: string | undefined;
  isEditMode: boolean;
  pendingConnections: PendingConnection[];
}

interface UpdateInput {
  id: string;
  data: ItemPayload;
}

export function useItemMutations({ id, isEditMode, pendingConnections }: UseItemMutationsArgs) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const connectMutation = useMutation({
    mutationFn: async (input: ConnectInput) => unwrap(await connectionsConnect({ body: input })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'connections'] }),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: ItemPayload) => unwrap(await itemsCreate({ body: payload })),
    onSuccess: async (result) => {
      const newItemId = result.data.id;
      const connected = await applyConnections(newItemId, pendingConnections, connectMutation);
      reportCreateSuccess(connected, pendingConnections.length > 0);
      // Navigate BEFORE invalidations to avoid a race where the cache invalidation
      // triggers a refetch + re-render of the current page that drops the
      // navigate call (observed in React 19; see issue #2157). The detail page
      // fetches fresh data on mount, and onSettled invalidates the items prefix.
      void navigate(`/inventory/items/${newItemId}`);
    },
    onError: (err: Error) => toast.error(`Failed to create: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] }),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateInput) =>
      unwrap(await itemsUpdate({ path: { id: input.id }, body: input.data })),
    onSuccess: () => {
      toast.success('Item updated');
      // Navigate BEFORE invalidations to avoid a race where the cache invalidation
      // triggers a refetch + re-render of the edit page that silently drops the
      // navigate call (observed in React 19; see issue #2157). The destination
      // detail page fetches fresh data on mount via its own queries.
      void navigate(`/inventory/items/${id}`);
    },
    onError: (err: Error) => toast.error(`Failed to update: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] }),
  });

  const onSubmit = useCallback(
    (values: ItemFormValues) => {
      if (!values.itemName.trim()) {
        toast.error('Item name is required');
        return;
      }
      const payload = buildItemPayload(values);
      if (isEditMode && id) {
        updateMutation.mutate({ id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    },
    [isEditMode, id, createMutation, updateMutation]
  );

  return {
    createMutation,
    updateMutation,
    isMutating: createMutation.isPending || updateMutation.isPending,
    onSubmit,
  };
}
