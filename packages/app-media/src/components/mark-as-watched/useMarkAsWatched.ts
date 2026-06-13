import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';

interface WatchHistoryEntry {
  id: number;
  watchedAt: string;
}

interface WatchHistoryListResult {
  data: WatchHistoryEntry[];
}

interface LogResult {
  data: { id: number };
  watchlistRemoved: boolean;
}

interface LogInput {
  mediaType: 'movie';
  mediaId: number;
  completed?: number;
  watchedAt?: string;
}

interface AddToWatchlistInput {
  mediaType: 'movie';
  mediaId: number;
}

function useCrossRouterInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist'] });
    void queryClient.invalidateQueries({ queryKey: ['media', 'comparisons'] });
  };
}

function useUndoMutation(mediaId: number) {
  const invalidateCross = useCrossRouterInvalidation();
  const addToWatchlistMutation = usePillarMutation<AddToWatchlistInput, unknown>('media', [
    'watchlist',
    'add',
  ]);
  const deleteMutation = usePillarMutation<{ id: number }, unknown>(
    'media',
    ['watchHistory', 'delete'],
    {
      onSuccess: () => {
        toast.success('Watch entry undone');
        invalidateCross();
      },
      onError: (err) => {
        toast.error(`Failed to undo: ${err.message}`);
      },
    }
  );

  const handleUndo = (entryId: number, watchlistRemoved: boolean) => {
    deleteMutation.mutate(
      { id: entryId },
      {
        onSuccess: () => {
          if (watchlistRemoved) {
            addToWatchlistMutation.mutate({ mediaType: 'movie', mediaId });
          }
        },
      }
    );
  };

  return handleUndo;
}

function useLogMutation({
  handleUndo,
  setShowDatePicker,
  setCustomDate,
}: {
  handleUndo: (id: number, removed: boolean) => void;
  setShowDatePicker: (v: boolean) => void;
  setCustomDate: (v: string) => void;
}) {
  const invalidateCross = useCrossRouterInvalidation();
  return usePillarMutation<LogInput, LogResult>('media', ['watchHistory', 'log'], {
    onSuccess: (result) => {
      toast.success('Marked as watched', {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            handleUndo(result.data.id, result.watchlistRemoved);
          },
        },
      });
      invalidateCross();
      setShowDatePicker(false);
      setCustomDate('');
    },
    onError: (err) => {
      toast.error(`Failed to log watch: ${err.message}`);
    },
  });
}

export function useMarkAsWatched(mediaId: number) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState('');

  const { data: historyData } = usePillarQuery<WatchHistoryListResult>(
    'media',
    ['watchHistory', 'list'],
    { mediaType: 'movie', mediaId, limit: 100 },
    { staleTime: 30_000 }
  );

  const watchCount = historyData?.data?.length ?? 0;
  const lastWatched = historyData?.data?.[0]?.watchedAt;

  const handleUndo = useUndoMutation(mediaId);
  const logMutation = useLogMutation({ handleUndo, setShowDatePicker, setCustomDate });

  const handleMarkWatched = () => {
    logMutation.mutate({ mediaType: 'movie', mediaId, completed: 1 });
  };

  const handleMarkWatchedWithDate = () => {
    if (!customDate) return;
    logMutation.mutate({
      mediaType: 'movie',
      mediaId,
      watchedAt: new Date(customDate).toISOString(),
      completed: 1,
    });
  };

  return {
    showDatePicker,
    setShowDatePicker,
    customDate,
    setCustomDate,
    watchCount,
    lastWatched,
    logMutation,
    handleMarkWatched,
    handleMarkWatchedWithDate,
  };
}
