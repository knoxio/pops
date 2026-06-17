import { useMutation } from '@tanstack/react-query';

import { unwrap } from '../../media-api-helpers.js';
import {
  discoveryDismiss,
  libraryAddMovie,
  watchHistoryLog,
  watchlistAdd,
  watchlistRemove,
} from '../../media-api/index.js';

import type {
  DiscoveryDismissData,
  LibraryAddMovieData,
  LibraryAddMovieResponses,
  WatchHistoryLogData,
  WatchHistoryLogResponses,
  WatchlistAddData,
  WatchlistAddResponses,
  WatchlistRemoveData,
} from '../../media-api/types.gen.js';

type AddMovieInput = NonNullable<LibraryAddMovieData['body']>;
type AddMovieResult = LibraryAddMovieResponses[200];
type AddWatchlistInput = NonNullable<WatchlistAddData['body']>;
type AddWatchlistResult = WatchlistAddResponses[201];
type RemoveWatchlistInput = WatchlistRemoveData['path'];
type LogWatchInput = NonNullable<WatchHistoryLogData['body']>;
type LogWatchResult = WatchHistoryLogResponses[201];
type DismissInput = NonNullable<DiscoveryDismissData['body']>;

export function useDiscoverMutations() {
  const addMovieMutation = useMutation<AddMovieResult, Error, AddMovieInput>({
    mutationFn: async (body) => unwrap(await libraryAddMovie({ body })),
  });
  const addWatchlistMutation = useMutation<AddWatchlistResult, Error, AddWatchlistInput>({
    mutationFn: async (body) => unwrap(await watchlistAdd({ body })),
  });
  const removeWatchlistMutation = useMutation<unknown, Error, RemoveWatchlistInput>({
    mutationFn: async (path) => unwrap(await watchlistRemove({ path })),
  });
  const logWatchMutation = useMutation<LogWatchResult, Error, LogWatchInput>({
    mutationFn: async (body) => unwrap(await watchHistoryLog({ body })),
  });
  const dismissMutation = useMutation<unknown, Error, DismissInput>({
    mutationFn: async (body) => unwrap(await discoveryDismiss({ body })),
  });
  return {
    addMovieMutation,
    addWatchlistMutation,
    removeWatchlistMutation,
    logWatchMutation,
    dismissMutation,
  };
}
