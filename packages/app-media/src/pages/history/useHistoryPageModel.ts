import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

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
  const utils = usePillarUtils('media');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const deleteMutation = usePillarMutation<{ id: number }, unknown>(
    'media',
    ['watchHistory', 'delete'],
    {
      onSuccess: () => {
        toast.success('Watch event removed');
        void utils.invalidate(['watchHistory']);
        void utils.invalidate(['watchlist']);
        if (entriesLength === 1 && offset > 0) {
          setOffset(Math.max(0, offset - PAGE_SIZE));
        }
      },
      onError: (err) => {
        toast.error(`Failed to delete watch event: ${err.message}`);
      },
    }
  );

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

  const { data, isLoading, error } = usePillarQuery<WatchHistoryListResult>(
    'media',
    ['watchHistory', 'listRecent'],
    queryInput
  );

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
