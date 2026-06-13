import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation } from '@pops/pillar-sdk/react';

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

interface CreateLocationInput {
  name: string;
  parentId: string | null;
}

interface UpdateLocationInput {
  id: string;
  data: { name?: string; parentId?: string | null };
}

interface DeleteLocationInput {
  id: string;
  force?: boolean;
}

interface DeleteLocationResult {
  requiresConfirmation?: boolean;
  stats?: DeleteConfirmState['stats'];
}

function useDeleteFlow(
  args: LocationMutationsArgs,
  pendingDeleteRef: React.MutableRefObject<{ id: string; name: string } | null>,
  setDeleteConfirm: (v: DeleteConfirmState | null) => void
) {
  return usePillarMutation<DeleteLocationInput, DeleteLocationResult>(
    'inventory',
    ['locations', 'delete'],
    {
      onSuccess: (result) => {
        if (result.requiresConfirmation && result.stats) {
          const node = pendingDeleteRef.current;
          if (node) setDeleteConfirm({ id: node.id, name: node.name, stats: result.stats });
          return;
        }
        toast.success('Location deleted');
        if (args.selectedId === pendingDeleteRef.current?.id) args.setSelectedId(null);
        setDeleteConfirm(null);
        pendingDeleteRef.current = null;
      },
      onError: (err) => {
        toast.error(`Failed to delete: ${err.message}`);
        setDeleteConfirm(null);
        pendingDeleteRef.current = null;
      },
    }
  );
}

export function useLocationMutations(args: LocationMutationsArgs) {
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const pendingDeleteRef = useRef<{ id: string; name: string } | null>(null);

  const createMutation = usePillarMutation<CreateLocationInput, unknown>(
    'inventory',
    ['locations', 'create'],
    {
      onSuccess: () => {
        toast.success('Location created');
        args.setAddingChildOf(null);
        args.setAddingRoot(false);
      },
      onError: (err) => toast.error(`Failed to create location: ${err.message}`),
    }
  );

  const updateMutation = usePillarMutation<UpdateLocationInput, unknown>(
    'inventory',
    ['locations', 'update'],
    {
      onSuccess: () => {
        toast.success('Location updated');
      },
      onError: (err) => toast.error(`Failed to update location: ${err.message}`),
    }
  );

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
