import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { watchHistoryDelete, watchHistoryListRecent } from '../../media-api/index.js';
import { PAGE_SIZE, type HistoryEntry, type MediaTypeFilter } from './types';

interface WatchHistoryListResult {
  data: HistoryEntry[];
  pagination?: { total: number };
}

function useDeleteFlow({
  entriesLength,
  offset,
  setOffset,
}: {
  entriesLength: number;
  offset: number;
  setOffset: React.Dispatch<React.SetStateAction<number>>;
}) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (input: { id: number }) =>
      unwrap(await watchHistoryDelete({ path: { id: input.id } })),
    onSuccess: () => {
      toast.success('Watch event removed');
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchHistory'] });
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist'] });
      if (entriesLength === 1 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
      }
    },
    onError: (err: Error) => {
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

  const { data, isLoading, error } = useQuery<WatchHistoryListResult>({
    queryKey: ['media', 'watchHistory', 'listRecent', queryInput],
    queryFn: async () => unwrap(await watchHistoryListRecent({ query: queryInput })),
  });

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
    ...deleteFlow,
  };
}
