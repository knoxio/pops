import { trpc } from '@pops/api-client';

export function useDiscoverMutations() {
  const addMovieMutation = trpc.media.library.addMovie.useMutation();
  const addWatchlistMutation = trpc.media.watchlist.add.useMutation();
  const removeWatchlistMutation = trpc.media.watchlist.remove.useMutation();
  const logWatchMutation = trpc.media.watchHistory.log.useMutation();
  const dismissMutation = trpc.media.discovery.dismiss.useMutation();
  return {
    addMovieMutation,
    addWatchlistMutation,
    removeWatchlistMutation,
    logWatchMutation,
    dismissMutation,
  };
}
