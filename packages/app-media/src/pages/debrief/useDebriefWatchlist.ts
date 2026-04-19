import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface UseDebriefWatchlistArgs {
  enabled: boolean;
  resolveTitle: (mediaId: number) => string;
}

export function useDebriefWatchlist({ enabled, resolveTitle }: UseDebriefWatchlistArgs) {
  const utils = trpc.useUtils();

  const { data: watchlistData } = trpc.media.watchlist.list.useQuery(
    { mediaType: 'movie' },
    { enabled }
  );

  const watchlistedMovies = useMemo(
    () =>
      new Map(
        (watchlistData?.data ?? [])
          .filter((e: { mediaType: string }) => e.mediaType === 'movie')
          .map((e: { mediaId: number; id: number }) => [e.mediaId, e.id])
      ),
    [watchlistData]
  );

  const addMutation = trpc.media.watchlist.add.useMutation({
    onSuccess: (_data, variables) => {
      void utils.media.watchlist.list.invalidate();
      toast.success(`${resolveTitle(variables.mediaId)} added to watchlist`);
    },
  });

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: (_data, variables) => {
      void utils.media.watchlist.list.invalidate();
      const mediaId = [...watchlistedMovies.entries()].find(
        ([, entryId]) => entryId === variables.id
      )?.[0];
      toast.success(`${mediaId != null ? resolveTitle(mediaId) : 'Movie'} removed from watchlist`);
    },
  });

  const handleToggleWatchlist = useCallback(
    (mediaId: number) => {
      const entryId = watchlistedMovies.get(mediaId);
      if (entryId !== undefined) {
        removeMutation.mutate({ id: entryId });
      } else {
        addMutation.mutate({ mediaType: 'movie', mediaId });
      }
    },
    [watchlistedMovies, addMutation, removeMutation]
  );

  return {
    watchlistedMovies,
    handleToggleWatchlist,
    pending: addMutation.isPending || removeMutation.isPending,
  };
}
