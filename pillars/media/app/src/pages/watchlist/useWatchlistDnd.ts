import {
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useState } from 'react';

import type { WatchlistEntry } from './types';

interface UseWatchlistDndArgs {
  sortedEntries: WatchlistEntry[];
  isReordering: boolean;
  optimisticOrder: WatchlistEntry[] | null;
  setOptimisticOrder: (v: WatchlistEntry[] | null) => void;
  setIsReordering: (v: boolean) => void;
  reorder: (items: { id: number; priority: number }[]) => void;
}

function computeReorder(
  event: DragEndEvent,
  sortedEntries: WatchlistEntry[],
  optimisticOrder: WatchlistEntry[] | null
): { reordered: WatchlistEntry[]; items: { id: number; priority: number }[] } | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const currentOrder = optimisticOrder ?? sortedEntries;
  const oldIndex = currentOrder.findIndex((e) => e.id === active.id);
  const newIndex = currentOrder.findIndex((e) => e.id === over.id);
  if (oldIndex === -1 || newIndex === -1) return null;
  const reordered = arrayMove(currentOrder, oldIndex, newIndex);
  const items = reordered.map((entry, i) => ({ id: entry.id, priority: i }));
  return { reordered, items };
}

export function useWatchlistDnd({
  sortedEntries,
  isReordering,
  optimisticOrder,
  setOptimisticOrder,
  setIsReordering,
  reorder,
}: UseWatchlistDndArgs) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (isReordering) return;
      setActiveId(event.active.id as number);
      setOptimisticOrder([...sortedEntries]);
    },
    [sortedEntries, isReordering, setOptimisticOrder]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (isReordering) return;
      setActiveId(null);
      const result = computeReorder(event, sortedEntries, optimisticOrder);
      if (!result) {
        setOptimisticOrder(null);
        return;
      }
      setOptimisticOrder(result.reordered);
      setIsReordering(true);
      reorder(result.items);
    },
    [sortedEntries, optimisticOrder, isReordering, reorder, setIsReordering, setOptimisticOrder]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOptimisticOrder(null);
  }, [setOptimisticOrder]);

  return {
    activeId,
    sensors,
    collisionDetection: closestCenter,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
