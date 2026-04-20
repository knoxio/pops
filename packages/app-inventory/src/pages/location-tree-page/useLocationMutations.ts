import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { LocationTreeNode } from './utils';

export interface DeleteConfirmState {
  id: string;
  name: string;
  stats: {
    childCount: number;
    descendantCount: number;
    itemCount: number;
    totalItemCount: number;
  };
}

export interface LocationMutationsArgs {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setAddingRoot: (v: boolean) => void;
  setAddingChildOf: (v: string | null) => void;
  nodeMap: Map<string, LocationTreeNode>;
}

function useDeleteFlow(
  args: LocationMutationsArgs,
  pendingDeleteRef: React.MutableRefObject<{ id: string; name: string } | null>,
  setDeleteConfirm: (v: DeleteConfirmState | null) => void
) {
  const utils = trpc.useUtils();
  return trpc.inventory.locations.delete.useMutation({
    onSuccess: (result) => {
      if ('requiresConfirmation' in result && result.requiresConfirmation && result.stats) {
        const node = pendingDeleteRef.current;
        if (node) setDeleteConfirm({ id: node.id, name: node.name, stats: result.stats });
        return;
      }
      toast.success('Location deleted');
      void utils.inventory.locations.tree.invalidate();
      if (args.selectedId === pendingDeleteRef.current?.id) args.setSelectedId(null);
      setDeleteConfirm(null);
      pendingDeleteRef.current = null;
    },
    onError: (err) => {
      toast.error(`Failed to delete: ${err.message}`);
      setDeleteConfirm(null);
      pendingDeleteRef.current = null;
    },
  });
}

export function useLocationMutations(args: LocationMutationsArgs) {
  const utils = trpc.useUtils();
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const pendingDeleteRef = useRef<{ id: string; name: string } | null>(null);

  const createMutation = trpc.inventory.locations.create.useMutation({
    onSuccess: () => {
      toast.success('Location created');
      void utils.inventory.locations.tree.invalidate();
      args.setAddingChildOf(null);
      args.setAddingRoot(false);
    },
    onError: (err) => toast.error(`Failed to create location: ${err.message}`),
  });

  const updateMutation = trpc.inventory.locations.update.useMutation({
    onSuccess: () => {
      toast.success('Location updated');
      void utils.inventory.locations.tree.invalidate();
    },
    onError: (err) => toast.error(`Failed to update location: ${err.message}`),
  });

  const deleteMutation = useDeleteFlow(args, pendingDeleteRef, setDeleteConfirm);

  const handleDelete = useCallback(
    (id: string) => {
      const node = args.nodeMap.get(id);
      if (!node) return;
      pendingDeleteRef.current = { id, name: node.name };
      deleteMutation.mutate({ id });
    },
    [args.nodeMap, deleteMutation]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return;
    deleteMutation.mutate({ id: deleteConfirm.id, force: true });
  }, [deleteConfirm, deleteMutation]);

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    deleteConfirm,
    setDeleteConfirm,
    handleDelete,
    handleDeleteConfirm,
  };
}
