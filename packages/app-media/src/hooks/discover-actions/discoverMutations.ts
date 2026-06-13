import { usePillarMutation } from '@pops/pillar-sdk/react';

interface AddMovieInput {
  tmdbId: number;
}

interface AddMovieResult {
  created: boolean;
  data: { id: number; title: string };
}

interface AddWatchlistInput {
  mediaType: 'movie';
  mediaId: number;
}

interface AddWatchlistResult {
  created: boolean;
}

interface RemoveWatchlistInput {
  id: number;
}

interface LogWatchInput {
  mediaType: 'movie';
  mediaId: number;
}

interface LogWatchResult {
  watchlistRemoved: boolean;
}

interface DismissInput {
  tmdbId: number;
}

export function useDiscoverMutations() {
  const addMovieMutation = usePillarMutation<AddMovieInput, AddMovieResult>('media', [
    'library',
    'addMovie',
  ]);
  const addWatchlistMutation = usePillarMutation<AddWatchlistInput, AddWatchlistResult>('media', [
    'watchlist',
    'add',
  ]);
  const removeWatchlistMutation = usePillarMutation<RemoveWatchlistInput, unknown>('media', [
    'watchlist',
    'remove',
  ]);
  const logWatchMutation = usePillarMutation<LogWatchInput, LogWatchResult>('media', [
    'watchHistory',
    'log',
  ]);
  const dismissMutation = usePillarMutation<DismissInput, unknown>('media', [
    'discovery',
    'dismiss',
  ]);
  return {
    addMovieMutation,
    addWatchlistMutation,
    removeWatchlistMutation,
    logWatchMutation,
    dismissMutation,
  };
}
