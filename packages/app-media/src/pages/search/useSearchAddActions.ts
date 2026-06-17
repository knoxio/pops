import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unwrap } from '../../media-api-helpers.js';
import {
  libraryAddMovie,
  libraryAddTvShow,
  watchHistoryLog,
  watchlistAdd,
} from '../../media-api/index.js';
import {
  makeKey,
  useAddMovieHandler,
  useAddToWatchlistAndLibraryHandler,
  useAddTvShowHandler,
  useMarkWatchedAndLibraryHandler,
  useMarkWatchedHandler,
} from './useSearchAddHandlers';
import { useSearchAddState } from './useSearchAddState';

function useSearchAddMutations() {
  const queryClient = useQueryClient();

  const addMovieMutation = useMutation({
    mutationFn: async (input: { tmdbId: number }) =>
      unwrap(await libraryAddMovie({ body: { tmdbId: input.tmdbId } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'movies'] });
    },
  });

  const addTvShowMutation = useMutation({
    mutationFn: async (input: { tvdbId: number }) =>
      unwrap(await libraryAddTvShow({ body: { tvdbId: input.tvdbId } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'tvShows'] });
    },
  });

  const watchlistAddMutation = useMutation({
    mutationFn: async (input: { mediaType: 'movie'; mediaId: number }) =>
      unwrap(await watchlistAdd({ body: { mediaType: input.mediaType, mediaId: input.mediaId } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist'] });
    },
  });

  const watchHistoryLogMutation = useMutation({
    mutationFn: async (input: { mediaType: 'movie'; mediaId: number }) =>
      unwrap(
        await watchHistoryLog({
          body: {
            mediaType: input.mediaType,
            mediaId: input.mediaId,
            completed: 1,
            source: 'manual',
          },
        })
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchHistory'] });
    },
  });

  return { addMovieMutation, addTvShowMutation, watchlistAddMutation, watchHistoryLogMutation };
}

/**
 * Encapsulates "Add to library" mutations for movies and TV shows, plus
 * compound flows ("watchlist + library", "watched + library") and the
 * pending/added bookkeeping used by the SearchPage cards.
 */
export function useSearchAddActions() {
  const state = useSearchAddState();
  const handlerArgs = { state, ...useSearchAddMutations() };

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
