import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { ItemFormValues, PendingConnection } from './types';

interface ConnectMutation {
  mutateAsync: (input: { itemAId: string; itemBId: string }) => Promise<unknown>;
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

function buildItemPayload(values: ItemFormValues) {
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

export function useItemMutations({ id, isEditMode, pendingConnections }: UseItemMutationsArgs) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const connectMutation = trpc.inventory.connections.connect.useMutation();

  const createMutation = trpc.inventory.items.create.useMutation({
    onSuccess: async (result) => {
      const newItemId = result.data.id;
      const connected = await applyConnections(newItemId, pendingConnections, connectMutation);
      reportCreateSuccess(connected, pendingConnections.length > 0);
      void utils.inventory.items.list.invalidate();
      navigate(`/inventory/items/${newItemId}`);
    },
    onError: (err) => toast.error(`Failed to create: ${err.message}`),
  });

  const updateMutation = trpc.inventory.items.update.useMutation({
    onSuccess: () => {
      toast.success('Item updated');
      void utils.inventory.items.list.invalidate();
      void utils.inventory.items.get.invalidate({ id: id ?? '' });
      navigate(`/inventory/items/${id}`);
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
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
