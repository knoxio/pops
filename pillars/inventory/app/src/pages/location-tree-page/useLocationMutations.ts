import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../inventory-api-helpers.js';
import { locationsCreate, locationsDelete, locationsUpdate } from '../../inventory-api/index.js';

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
  data: { name?: string; parentId?: string | null; sortOrder?: number };
}

interface DeleteLocationInput {
  id: string;
  force?: boolean;
}

type DeleteLocationResult =
  | { message: string }
  | { requiresConfirmation: true; stats: DeleteConfirmState['stats'] };

const LOCATIONS_KEY = ['inventory', 'locations'] as const;

function useDeleteFlow(
  args: LocationMutationsArgs,
  pendingDeleteRef: React.MutableRefObject<{ id: string; name: string } | null>,
  setDeleteConfirm: (v: DeleteConfirmState | null) => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: DeleteLocationInput): Promise<DeleteLocationResult> =>
      unwrap(await locationsDelete({ path: { id }, query: { force } })),
    onSuccess: (result) => {
      if ('requiresConfirmation' in result) {
        const node = pendingDeleteRef.current;
        if (node) setDeleteConfirm({ id: node.id, name: node.name, stats: result.stats });
        return;
      }
      toast.success('Location deleted');
      if (args.selectedId === pendingDeleteRef.current?.id) args.setSelectedId(null);
      setDeleteConfirm(null);
      pendingDeleteRef.current = null;
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete: ${err.message}`);
      setDeleteConfirm(null);
      pendingDeleteRef.current = null;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  });
}

export function useLocationMutations(args: LocationMutationsArgs) {
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const pendingDeleteRef = useRef<{ id: string; name: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: async ({ name, parentId }: CreateLocationInput) =>
      unwrap(await locationsCreate({ body: { name, parentId, sortOrder: 0 } })),
    onSuccess: () => {
      toast.success('Location created');
      args.setAddingChildOf(null);
      args.setAddingRoot(false);
    },
    onError: (err: Error) => toast.error(`Failed to create location: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: UpdateLocationInput) =>
      unwrap(await locationsUpdate({ path: { id }, body: data })),
    onSuccess: () => {
      toast.success('Location updated');
    },
    onError: (err: Error) => toast.error(`Failed to update location: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY }),
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
