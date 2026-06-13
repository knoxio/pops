import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

interface UseArenaWatchlistArgs {
  enabled: boolean;
  resolveTitle: (mediaId: number) => string;
}

interface WatchlistEntry {
  id: number;
  mediaType: string;
  mediaId: number;
}

interface WatchlistListResult {
  data: WatchlistEntry[];
}

interface AddInput {
  mediaType: 'movie';
  mediaId: number;
}

/**
 * Movie watchlist state for the Compare Arena: lookup map of currently
 * watchlisted movies and a toggle that mutates add/remove with toasts.
 */
export function useArenaWatchlist({ enabled, resolveTitle }: UseArenaWatchlistArgs) {
  const utils = usePillarUtils('media');

  const { data: watchlistData } = usePillarQuery<WatchlistListResult>(
    'media',
    ['watchlist', 'list'],
    { mediaType: 'movie' },
    { enabled }
  );

  const watchlistedMovies = useMemo(
    () =>
      new Map<number, number>(
        (watchlistData?.data ?? [])
          .filter((e) => e.mediaType === 'movie')
          .map((e) => [e.mediaId, e.id])
      ),
    [watchlistData]
  );

  const addMutation = usePillarMutation<AddInput, unknown>('media', ['watchlist', 'add'], {
    onSuccess: (_data, variables) => {
      void utils.invalidate(['watchlist']);
      toast.success(`${resolveTitle(variables.mediaId)} added to watchlist`);
    },
  });

  const removeMutation = usePillarMutation<{ id: number }, unknown>(
    'media',
    ['watchlist', 'remove'],
    {
      onSuccess: (_data, variables) => {
        void utils.invalidate(['watchlist']);
        const mediaId = [...watchlistedMovies.entries()].find(
          ([, entryId]) => entryId === variables.id
        )?.[0];
        toast.success(
          `${mediaId != null ? resolveTitle(mediaId) : 'Movie'} removed from watchlist`
        );
      },
    }
  );

  const handleToggleWatchlist = useCallback(
    (movieId: number) => {
      const entryId = watchlistedMovies.get(movieId);
      if (entryId !== undefined) {
        removeMutation.mutate({ id: entryId });
      } else {
        addMutation.mutate({ mediaType: 'movie', mediaId: movieId });
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
