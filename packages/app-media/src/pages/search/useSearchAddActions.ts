import { usePillarMutation } from '@pops/pillar-sdk/react';

import {
  makeKey,
  useAddMovieHandler,
  useAddToWatchlistAndLibraryHandler,
  useAddTvShowHandler,
  useMarkWatchedAndLibraryHandler,
  useMarkWatchedHandler,
} from './useSearchAddHandlers';
import { useSearchAddState } from './useSearchAddState';

interface AddMovieInput {
  tmdbId: number;
}

interface AddMovieResponse {
  data: { id: number; title: string };
  created: boolean;
  message?: string;
}

interface AddTvShowInput {
  tvdbId: number;
}

interface AddTvShowResponse {
  data: { show: { id: number; name: string } };
  created: boolean;
  message?: string;
}

interface WatchlistAddInput {
  mediaType: 'movie';
  mediaId: number;
}

interface WatchHistoryLogInput {
  mediaType: 'movie';
  mediaId: number;
}

/**
 * Encapsulates "Add to library" mutations for movies and TV shows, plus
 * compound flows ("watchlist + library", "watched + library") and the
 * pending/added bookkeeping used by the SearchPage cards.
 */
export function useSearchAddActions() {
  const state = useSearchAddState();
  const addMovieMutation = usePillarMutation<AddMovieInput, AddMovieResponse>('media', [
    'library',
    'addMovie',
  ]);
  const addTvShowMutation = usePillarMutation<AddTvShowInput, AddTvShowResponse>('media', [
    'library',
    'addTvShow',
  ]);
  const watchlistAddMutation = usePillarMutation<WatchlistAddInput, unknown>('media', [
    'watchlist',
    'add',
  ]);
  const watchHistoryLogMutation = usePillarMutation<WatchHistoryLogInput, unknown>('media', [
    'watchHistory',
    'log',
  ]);

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
