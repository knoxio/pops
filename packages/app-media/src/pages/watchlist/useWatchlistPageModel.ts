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
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { parseTypeParam, type WatchlistEntry, type WatchlistFilter } from './types';
import { useWatchlistMediaMaps } from './useWatchlistMediaMaps';

export function useWatchlistPageModel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseTypeParam(searchParams.get('type'));
  const [isReordering, setIsReordering] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updateErrorId, setUpdateErrorId] = useState<number | null>(null);
  const [updateErrorMsg, setUpdateErrorMsg] = useState<string | null>(null);
  const [optimisticOrder, setOptimisticOrder] = useState<WatchlistEntry[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  const setFilter = useCallback(
    (value: WatchlistFilter) => {
      setSearchParams(value === 'all' ? {} : { type: value }, { replace: true });
    },
    [setSearchParams]
  );

  const {
    data: watchlistData,
    isLoading,
    error: watchlistError,
  } = trpc.media.watchlist.list.useQuery({
    ...(filter !== 'all' ? { mediaType: filter } : {}),
    limit: 500,
  });

  const { data: moviesData, isLoading: moviesLoading } = trpc.media.movies.list.useQuery({
    limit: 500,
  });

  const { data: tvShowsData, isLoading: tvShowsLoading } = trpc.media.tvShows.list.useQuery({
    limit: 500,
  });

  const utils = trpc.useUtils();
  const { getMetaForEntry } = useWatchlistMediaMaps(moviesData, tvShowsData);

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: () => {
      setRemovingId(null);
      toast.success('Removed from watchlist');
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
      setRemovingId(null);
      toast.error(`Failed to remove: ${err.message}`);
    },
  });

  const updateMutation = trpc.media.watchlist.update.useMutation({
    onSuccess: () => {
      setUpdateErrorId(null);
      setUpdateErrorMsg(null);
      toast.success('Notes saved');
      void utils.media.watchlist.list.invalidate();
    },
    onError: (error: { message: string }) => {
      setUpdateErrorMsg(error.message ?? 'Failed to save notes');
      toast.error(`Failed to save notes: ${error.message}`);
    },
  });

  const reorderMutation = trpc.media.watchlist.reorder.useMutation({
    onSuccess: () => {
      setOptimisticOrder(null);
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
      setOptimisticOrder(null);
      toast.error(`Failed to reorder: ${err.message}`);
    },
    onSettled: () => {
      setIsReordering(false);
    },
  });

  const loading = isLoading || moviesLoading || tvShowsLoading;
  const entries = watchlistData?.data ?? [];
  const sortedEntries = optimisticOrder ?? entries;
  const hasManyItems = sortedEntries.length >= 2;

  const handleMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      if (isReordering) return;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sortedEntries.length) return;

      const reordered = [...sortedEntries];
      const [moved] = reordered.splice(index, 1);
      if (!moved) return;
      reordered.splice(newIndex, 0, moved);

      const items = reordered.map((entry: WatchlistEntry, i: number) => ({
        id: entry.id,
        priority: i,
      }));

      setIsReordering(true);
      reorderMutation.mutate({ items });
    },
    [sortedEntries, reorderMutation, isReordering]
  );

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
    [sortedEntries, isReordering]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (isReordering) return;
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) {
        setOptimisticOrder(null);
        return;
      }

      const currentOrder = optimisticOrder ?? sortedEntries;
      const oldIndex = currentOrder.findIndex((e) => e.id === active.id);
      const newIndex = currentOrder.findIndex((e) => e.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        setOptimisticOrder(null);
        return;
      }

      const reordered = arrayMove(currentOrder, oldIndex, newIndex);
      setOptimisticOrder(reordered);

      const items = reordered.map((entry: WatchlistEntry, i: number) => ({
        id: entry.id,
        priority: i,
      }));
      setIsReordering(true);
      reorderMutation.mutate({ items });
    },
    [sortedEntries, optimisticOrder, reorderMutation, isReordering]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOptimisticOrder(null);
  }, []);

  const onRemove = useCallback(
    (id: number) => {
      setRemovingId(id);
      removeMutation.mutate({ id });
    },
    [removeMutation]
  );

  const onUpdateNotes = useCallback(
    (id: number, notes: string | null) => {
      setUpdateErrorId(id);
      setUpdateErrorMsg(null);
      updateMutation.mutate({ id, data: { notes } });
    },
    [updateMutation]
  );

  return {
    filter,
    setFilter,
    watchlistError,
    loading,
    entries,
    sortedEntries,
    hasManyItems,
    isReordering,
    removingId,
    updateErrorId,
    updateErrorMsg,
    activeId,
    sensors,
    collisionDetection: closestCenter,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    handleMove,
    getMetaForEntry,
    onRemove,
    onUpdateNotes,
    updateMutation,
  };
}
