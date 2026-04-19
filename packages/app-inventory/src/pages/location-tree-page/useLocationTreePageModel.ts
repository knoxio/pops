import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { buildNodeMap, getSiblings, isDescendant, type LocationTreeNode } from './utils';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';

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

export function useLocationTreePageModel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const pendingDeleteRef = useRef<{ id: string; name: string } | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.inventory.locations.tree.useQuery();

  const createMutation = trpc.inventory.locations.create.useMutation({
    onSuccess: () => {
      toast.success('Location created');
      utils.inventory.locations.tree.invalidate();
      setAddingChildOf(null);
      setAddingRoot(false);
    },
    onError: (err) => toast.error(`Failed to create location: ${err.message}`),
  });

  const updateMutation = trpc.inventory.locations.update.useMutation({
    onSuccess: () => {
      toast.success('Location updated');
      utils.inventory.locations.tree.invalidate();
    },
    onError: (err) => toast.error(`Failed to update location: ${err.message}`),
  });

  const deleteMutation = trpc.inventory.locations.delete.useMutation({
    onSuccess: (result) => {
      if ('requiresConfirmation' in result && result.requiresConfirmation && result.stats) {
        const node = pendingDeleteRef.current;
        if (node) setDeleteConfirm({ id: node.id, name: node.name, stats: result.stats });
        return;
      }
      toast.success('Location deleted');
      utils.inventory.locations.tree.invalidate();
      if (selectedId === pendingDeleteRef.current?.id) setSelectedId(null);
      setDeleteConfirm(null);
      pendingDeleteRef.current = null;
    },
    onError: (err) => {
      toast.error(`Failed to delete: ${err.message}`);
      setDeleteConfirm(null);
      pendingDeleteRef.current = null;
    },
  });

  const treeNodes = data?.data ?? [];
  const nodeMap = useMemo(() => {
    const map = new Map<string, LocationTreeNode>();
    if (data?.data) buildNodeMap(data.data, map);
    return map;
  }, [data?.data]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    setAddingChildOf(parentId);
    setAddingRoot(false);
  }, []);

  const handleRename = useCallback(
    (id: string, newName: string) => updateMutation.mutate({ id, data: { name: newName } }),
    [updateMutation]
  );

  const handleNewChildSave = useCallback(
    (name: string) => createMutation.mutate({ name, parentId: addingChildOf }),
    [addingChildOf, createMutation]
  );

  const handleNewRootSave = useCallback(
    (name: string) => createMutation.mutate({ name, parentId: null }),
    [createMutation]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const node = nodeMap.get(id);
      if (!node) return;
      pendingDeleteRef.current = { id, name: node.name };
      deleteMutation.mutate({ id });
    },
    [nodeMap, deleteMutation]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return;
    deleteMutation.mutate({ id: deleteConfirm.id, force: true });
  }, [deleteConfirm, deleteMutation]);

  const handleMoveStart = useCallback((id: string) => setMovingId(id), []);

  const handleMoveTo = useCallback(
    (newParentId: string | null) => {
      if (!movingId) return;
      updateMutation.mutate({ id: movingId, data: { parentId: newParentId } }, {
        onSuccess: () => setMovingId(null),
      });
    },
    [movingId, updateMutation]
  );

  const handleReorder = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const siblings = getSiblings(id, treeNodes, nodeMap);
      const idx = siblings.findIndex((s) => s.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;
      const current = siblings[idx];
      const swap = siblings[swapIdx];
      if (!current || !swap) return;
      updateMutation.mutate({ id: current.id, data: { sortOrder: swap.sortOrder } });
      updateMutation.mutate({ id: swap.id, data: { sortOrder: current.sortOrder } });
    },
    [treeNodes, nodeMap, updateMutation]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over ? (event.over.id as string) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setOverId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeNode = nodeMap.get(active.id as string);
      const overNode = nodeMap.get(over.id as string);
      if (!activeNode || !overNode) return;
      if (isDescendant(active.id as string, over.id as string, nodeMap)) {
        toast.error('Cannot move a location into its own sub-location');
        return;
      }
      if (activeNode.parentId === overNode.parentId) {
        const siblings = getSiblings(active.id as string, treeNodes, nodeMap);
        const oldIndex = siblings.findIndex((s) => s.id === active.id);
        const newIndex = siblings.findIndex((s) => s.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(siblings, oldIndex, newIndex);
        reordered.forEach((n, index) => {
          if (n.sortOrder !== index) updateMutation.mutate({ id: n.id, data: { sortOrder: index } });
        });
      } else {
        updateMutation.mutate({ id: activeNode.id, data: { parentId: overNode.id } });
      }
    },
    [nodeMap, treeNodes, updateMutation]
  );

  return {
    treeNodes, nodeMap, isLoading, error,
    selectedId, addingChildOf, addingRoot, setAddingRoot, setAddingChildOf,
    movingId, setMovingId, activeId, overId,
    deleteConfirm, setDeleteConfirm,
    deleteMutation,
    handleSelect, handleAddChild, handleRename,
    handleNewChildSave, handleNewChildCancel: () => setAddingChildOf(null),
    handleNewRootSave, handleNewRootCancel: () => setAddingRoot(false),
    handleDelete, handleDeleteConfirm,
    handleMoveStart, handleMoveTo,
    handleReorder,
    handleDragStart, handleDragOver, handleDragEnd,
  };
}
