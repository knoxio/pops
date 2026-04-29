import { useCallback, useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';

import { useDragHandlers } from './useDragHandlers';
import { useLocationMutations, type DeleteConfirmState } from './useLocationMutations';
import { buildNodeMap, type LocationTreeNode } from './utils';

export type { DeleteConfirmState };

function useLocationTree() {
  const { data, isLoading, error } = trpc.inventory.locations.tree.useQuery();
  const treeNodes = useMemo(() => data?.data ?? [], [data]);
  const nodeMap = useMemo(() => {
    const map = new Map<string, LocationTreeNode>();
    if (data?.data) buildNodeMap(data.data, map);
    return map;
  }, [data?.data]);
  return { treeNodes, nodeMap, isLoading, error };
}

function useTreeUiState() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    setAddingChildOf(parentId);
    setAddingRoot(false);
  }, []);

  return {
    selectedId,
    setSelectedId,
    addingChildOf,
    setAddingChildOf,
    addingRoot,
    setAddingRoot,
    movingId,
    setMovingId,
    handleSelect,
    handleAddChild,
  };
}

interface CrudHandlersArgs {
  ui: ReturnType<typeof useTreeUiState>;
  mutations: ReturnType<typeof useLocationMutations>;
}

function useCrudHandlers({ ui, mutations }: CrudHandlersArgs) {
  const handleRename = useCallback(
    (id: string, newName: string) =>
      mutations.updateMutation.mutate({ id, data: { name: newName } }),
    [mutations.updateMutation]
  );
  const handleNewChildSave = useCallback(
    (name: string) => mutations.createMutation.mutate({ name, parentId: ui.addingChildOf }),
    [ui.addingChildOf, mutations.createMutation]
  );
  const handleNewRootSave = useCallback(
    (name: string) => mutations.createMutation.mutate({ name, parentId: null }),
    [mutations.createMutation]
  );
  const handleMoveStart = useCallback((id: string) => ui.setMovingId(id), [ui]);
  const handleMoveTo = useCallback(
    (newParentId: string | null) => {
      if (!ui.movingId) return;
      mutations.updateMutation.mutate(
        { id: ui.movingId, data: { parentId: newParentId } },
        { onSuccess: () => ui.setMovingId(null) }
      );
    },
    [ui, mutations.updateMutation]
  );
  return { handleRename, handleNewChildSave, handleNewRootSave, handleMoveStart, handleMoveTo };
}

export function useLocationTreePageModel() {
  const { treeNodes, nodeMap, isLoading, error } = useLocationTree();
  const ui = useTreeUiState();
  const mutations = useLocationMutations({
    selectedId: ui.selectedId,
    setSelectedId: ui.setSelectedId,
    setAddingRoot: ui.setAddingRoot,
    setAddingChildOf: ui.setAddingChildOf,
    nodeMap,
  });
  const drag = useDragHandlers(nodeMap, treeNodes, mutations.updateMutation);
  const { handleRename, handleNewChildSave, handleNewRootSave, handleMoveStart, handleMoveTo } =
    useCrudHandlers({ ui, mutations });

  return {
    treeNodes,
    nodeMap,
    isLoading,
    error,
    ...ui,
    deleteConfirm: mutations.deleteConfirm,
    setDeleteConfirm: mutations.setDeleteConfirm,
    deleteMutation: mutations.deleteMutation,
    createIsPending: mutations.createMutation.isPending,
    activeId: drag.activeId,
    overId: drag.overId,
    handleRename,
    handleNewChildSave,
    handleNewChildCancel: () => ui.setAddingChildOf(null),
    handleNewRootSave,
    handleDelete: mutations.handleDelete,
    handleDeleteConfirm: mutations.handleDeleteConfirm,
    handleMoveStart,
    handleMoveTo,
    handleReorder: drag.handleReorder,
    handleDragStart: drag.handleDragStart,
    handleDragOver: drag.handleDragOver,
    handleDragEnd: drag.handleDragEnd,
  };
}
