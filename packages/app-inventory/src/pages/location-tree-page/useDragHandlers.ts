import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { getSiblings, isDescendant, type LocationTreeNode } from './utils';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';

interface UpdateMutation {
  mutate: (input: { id: string; data: { sortOrder?: number; parentId?: string | null } }) => void;
}

interface DragEndArgs {
  event: DragEndEvent;
  nodeMap: Map<string, LocationTreeNode>;
  treeNodes: LocationTreeNode[];
  updateMutation: UpdateMutation;
}

interface ReorderArgs {
  activeId: string;
  overId: string;
  nodeMap: Map<string, LocationTreeNode>;
  treeNodes: LocationTreeNode[];
  updateMutation: UpdateMutation;
}

function reorderSiblings({
  activeId,
  overId,
  nodeMap,
  treeNodes,
  updateMutation,
}: ReorderArgs): void {
  const siblings = getSiblings(activeId, treeNodes, nodeMap);
  const oldIndex = siblings.findIndex((s) => s.id === activeId);
  const newIndex = siblings.findIndex((s) => s.id === overId);
  if (oldIndex < 0 || newIndex < 0) return;
  const reordered = arrayMove(siblings, oldIndex, newIndex);
  reordered.forEach((n, index) => {
    if (n.sortOrder !== index) updateMutation.mutate({ id: n.id, data: { sortOrder: index } });
  });
}

function handleDragEndCore({ event, nodeMap, treeNodes, updateMutation }: DragEndArgs): void {
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
    reorderSiblings({
      activeId: active.id as string,
      overId: over.id as string,
      nodeMap,
      treeNodes,
      updateMutation,
    });
  } else {
    updateMutation.mutate({ id: activeNode.id, data: { parentId: overNode.id } });
  }
}

export function useDragHandlers(
  nodeMap: Map<string, LocationTreeNode>,
  treeNodes: LocationTreeNode[],
  updateMutation: UpdateMutation
) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

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
      handleDragEndCore({ event, nodeMap, treeNodes, updateMutation });
    },
    [nodeMap, treeNodes, updateMutation]
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

  return { activeId, overId, handleDragStart, handleDragOver, handleDragEnd, handleReorder };
}
