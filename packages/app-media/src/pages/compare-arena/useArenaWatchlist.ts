import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { watchlistAdd, watchlistList, watchlistRemove } from '../../media-api/index.js';

interface UseArenaWatchlistArgs {
  enabled: boolean;
  resolveTitle: (mediaId: number) => string;
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
  const queryClient = useQueryClient();

  const watchlistQueryInput = { mediaType: 'movie' as const };
  const { data: watchlistData } = useQuery({
    queryKey: ['media', 'watchlist', 'list', watchlistQueryInput],
    queryFn: async () => unwrap(await watchlistList({ query: watchlistQueryInput })),
    enabled,
  });

  const watchlistedMovies = useMemo(
    () =>
      new Map<number, number>(
        (watchlistData?.data ?? [])
          .filter((e) => e.mediaType === 'movie')
          .map((e) => [e.mediaId, e.id])
      ),
    [watchlistData]
  );

  const invalidateWatchlist = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist'] });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: async (variables: AddInput) => unwrap(await watchlistAdd({ body: variables })),
    onSuccess: (_data, variables) => {
      invalidateWatchlist();
      toast.success(`${resolveTitle(variables.mediaId)} added to watchlist`);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (variables: { id: number }) =>
      unwrap(await watchlistRemove({ path: { id: variables.id } })),
    onSuccess: (_data, variables) => {
      invalidateWatchlist();
      const mediaId = [...watchlistedMovies.entries()].find(
        ([, entryId]) => entryId === variables.id
      )?.[0];
      toast.success(`${mediaId != null ? resolveTitle(mediaId) : 'Movie'} removed from watchlist`);
    },
  });

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
