import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';

import { trpc } from '@pops/api-client';

import { parseTypeParam, type WatchlistEntry, type WatchlistFilter } from './types';
import { useWatchlistDnd } from './useWatchlistDnd';
import { useWatchlistMediaMaps } from './useWatchlistMediaMaps';
import { useWatchlistMutations } from './useWatchlistMutations';

function useFilterState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseTypeParam(searchParams.get('type'));
  const setFilter = useCallback(
    (value: WatchlistFilter) => {
      setSearchParams(value === 'all' ? {} : { type: value }, { replace: true });
    },
    [setSearchParams]
  );
  return { filter, setFilter };
}

function useWatchlistData(filter: WatchlistFilter) {
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
  return {
    watchlistData,
    isLoading,
    watchlistError,
    moviesData,
    moviesLoading,
    tvShowsData,
    tvShowsLoading,
  };
}

function useMoveAndCallbacks({
  sortedEntries,
  isReordering,
  setIsReordering,
  mutations,
}: {
  sortedEntries: WatchlistEntry[];
  isReordering: boolean;
  setIsReordering: (v: boolean) => void;
  mutations: ReturnType<typeof useWatchlistMutations>;
}) {
  const handleMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      if (isReordering) return;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sortedEntries.length) return;
      const reordered = [...sortedEntries];
      const [moved] = reordered.splice(index, 1);
      if (!moved) return;
      reordered.splice(newIndex, 0, moved);
      const items = reordered.map((entry, i) => ({ id: entry.id, priority: i }));
      setIsReordering(true);
      mutations.reorderMutation.mutate({ items });
    },
    [sortedEntries, mutations.reorderMutation, isReordering, setIsReordering]
  );

  const onRemove = useCallback(
    (id: number) => {
      mutations.setRemovingId(id);
      mutations.removeMutation.mutate({ id });
    },
    [mutations]
  );

  const onUpdateNotes = useCallback(
    (id: number, notes: string | null) => {
      mutations.setUpdateErrorId(id);
      mutations.setUpdateErrorMsg(null);
      mutations.updateMutation.mutate({ id, data: { notes } });
    },
    [mutations]
  );

  return { handleMove, onRemove, onUpdateNotes };
}

export function useWatchlistPageModel() {
  const { filter, setFilter } = useFilterState();
  const [isReordering, setIsReordering] = useState(false);
  const [optimisticOrder, setOptimisticOrder] = useState<WatchlistEntry[] | null>(null);

  const data = useWatchlistData(filter);
  const { getMetaForEntry } = useWatchlistMediaMaps(data.moviesData, data.tvShowsData);
  const mutations = useWatchlistMutations({ setIsReordering, setOptimisticOrder });

  const entries = data.watchlistData?.data ?? [];
  const sortedEntries = optimisticOrder ?? entries;
  const loading = data.isLoading || data.moviesLoading || data.tvShowsLoading;

  const dnd = useWatchlistDnd({
    sortedEntries,
    isReordering,
    optimisticOrder,
    setOptimisticOrder,
    setIsReordering,
    reorder: (items) => mutations.reorderMutation.mutate({ items }),
  });

  const callbacks = useMoveAndCallbacks({
    sortedEntries,
    isReordering,
    setIsReordering,
    mutations,
  });

  return {
    filter,
    setFilter,
    watchlistError: data.watchlistError,
    loading,
    entries,
    sortedEntries,
    hasManyItems: sortedEntries.length >= 2,
    isReordering,
    removingId: mutations.removingId,
    updateErrorId: mutations.updateErrorId,
    updateErrorMsg: mutations.updateErrorMsg,
    activeId: dnd.activeId,
    sensors: dnd.sensors,
    collisionDetection: dnd.collisionDetection,
    handleDragStart: dnd.handleDragStart,
    handleDragEnd: dnd.handleDragEnd,
    handleDragCancel: dnd.handleDragCancel,
    ...callbacks,
    getMetaForEntry,
    updateMutation: mutations.updateMutation,
  };
}
