import { trpc } from '@pops/api-client';

import {
  makeKey,
  useAddMovieHandler,
  useAddToWatchlistAndLibraryHandler,
  useAddTvShowHandler,
  useMarkWatchedAndLibraryHandler,
  useMarkWatchedHandler,
} from './useSearchAddHandlers';
import { useSearchAddState } from './useSearchAddState';

/**
 * Encapsulates "Add to library" mutations for movies and TV shows, plus
 * compound flows ("watchlist + library", "watched + library") and the
 * pending/added bookkeeping used by the SearchPage cards.
 */
export function useSearchAddActions() {
  const state = useSearchAddState();
  const addMovieMutation = trpc.media.library.addMovie.useMutation();
  const addTvShowMutation = trpc.media.library.addTvShow.useMutation();
  const watchlistAddMutation = trpc.media.watchlist.add.useMutation();
  const watchHistoryLogMutation = trpc.media.watchHistory.log.useMutation();

  const handlerArgs = {
    state,
    addMovieMutation,
    addTvShowMutation,
    watchlistAddMutation,
    watchHistoryLogMutation,
  };

  return {
    addingIds: state.addingIds,
    addedIds: state.addedIds,
    addingToWatchlistIds: state.addingToWatchlistIds,
    markingWatchedTmdbIds: state.markingWatchedTmdbIds,
    markingWatchedMediaIds: state.markingWatchedMediaIds,
    sessionMovieLocalIds: state.sessionMovieLocalIds,
    sessionTvLocalIds: state.sessionTvLocalIds,
    handleAddMovie: useAddMovieHandler(handlerArgs),
    handleAddTvShow: useAddTvShowHandler(handlerArgs),
    handleAddToWatchlistAndLibrary: useAddToWatchlistAndLibraryHandler(handlerArgs),
    handleMarkWatchedAndLibrary: useMarkWatchedAndLibraryHandler(handlerArgs),
    handleMarkWatched: useMarkWatchedHandler(handlerArgs),
    makeKey,
  };
}
