import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { PAGE_SIZE, type MediaTypeFilter } from './types';

function useDeleteFlow({
  entriesLength,
  offset,
  setOffset,
}: {
  entriesLength: number;
  offset: number;
  setOffset: React.Dispatch<React.SetStateAction<number>>;
}) {
  const utils = trpc.useUtils();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const deleteMutation = trpc.media.watchHistory.delete.useMutation({
    onSuccess: () => {
      toast.success('Watch event removed');
      void utils.media.watchHistory.listRecent.invalidate();
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchlist.list.invalidate();
      if (entriesLength === 1 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
      }
    },
    onError: (err) => {
      toast.error(`Failed to delete watch event: ${err.message}`);
    },
  });

  const handleDeleteClick = useCallback((id: number) => setDeleteTarget(id), []);
  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget === null) return;
    deleteMutation.mutate({ id: deleteTarget });
    setDeleteTarget(null);
  }, [deleteTarget, deleteMutation]);

  return { deleteTarget, setDeleteTarget, deleteMutation, handleDeleteClick, handleDeleteConfirm };
}

export function useHistoryPageModel() {
  const [filter, setFilter] = useState<MediaTypeFilter>('all');
  const [offset, setOffset] = useState(0);

  const queryInput = {
    ...(filter !== 'all' ? { mediaType: filter } : {}),
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isLoading, error } = trpc.media.watchHistory.listRecent.useQuery(queryInput);
  const { data: pendingDebriefs } = trpc.media.comparisons.getPendingDebriefs.useQuery();

  const debriefByMovieId = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of pendingDebriefs?.data ?? []) {
      map.set(d.movieId, d.sessionId);
    }
    return map;
  }, [pendingDebriefs]);

  const entries = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;

  const deleteFlow = useDeleteFlow({ entriesLength: entries.length, offset, setOffset });

  return {
    filter,
    setFilter,
    offset,
    setOffset,
    data,
    isLoading,
    error,
    entries,
    total,
    hasMore,
    debriefByMovieId,
    ...deleteFlow,
  };
}
