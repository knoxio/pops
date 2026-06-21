import { useCallback } from 'react';
import { toast } from 'sonner';

import type { UseMutationResult } from '@tanstack/react-query';

import type { SearchResultType } from '../../components/SearchResultCard';
import type {
  LibraryAddMovieResponse,
  LibraryAddTvShowResponse,
  WatchHistoryLogResponse,
  WatchlistAddResponse,
} from '../../media-api/index.js';
import type { useSearchAddState } from './useSearchAddState';

export const makeKey = (type: SearchResultType, id: number) => `${type}:${id}`;

interface AddMovieInput {
  tmdbId: number;
}

interface AddTvShowInput {
  tvdbId: number;
}

interface WatchlistAddInput {
  mediaType: 'movie';
  mediaId: number;
}

interface WatchHistoryLogInput {
  mediaType: 'movie';
  mediaId: number;
}

interface HandlerArgs {
  state: ReturnType<typeof useSearchAddState>;
  addMovieMutation: UseMutationResult<LibraryAddMovieResponse, Error, AddMovieInput>;
  addTvShowMutation: UseMutationResult<LibraryAddTvShowResponse, Error, AddTvShowInput>;
  watchlistAddMutation: UseMutationResult<WatchlistAddResponse, Error, WatchlistAddInput>;
  watchHistoryLogMutation: UseMutationResult<WatchHistoryLogResponse, Error, WatchHistoryLogInput>;
}

export function useAddMovieHandler({ state, addMovieMutation }: HandlerArgs) {
  return useCallback(
    (tmdbId: number) => {
      const key = makeKey('movie', tmdbId);
      state.setAddingIds((prev) => new Set(prev).add(key));
      addMovieMutation.mutate(
        { tmdbId },
        {
          onSuccess: (result) => {
            state.setAddedIds((prev) => new Set(prev).add(key));
            state.setSessionMovieLocalIds((prev) => new Map(prev).set(tmdbId, result.data.id));
            toast.success('Movie added to library');
          },
          onError: (err) => toast.error(`Failed to add movie: ${err.message}`),
          onSettled: () => state.removeAdding(key),
        }
      );
    },
    [addMovieMutation, state]
  );
}

export function useAddTvShowHandler({ state, addTvShowMutation }: HandlerArgs) {
  return useCallback(
    (tvdbId: number) => {
      const key = makeKey('tv', tvdbId);
      state.setAddingIds((prev) => new Set(prev).add(key));
      addTvShowMutation.mutate(
        { tvdbId },
        {
          onSuccess: (result) => {
            state.setAddedIds((prev) => new Set(prev).add(key));
            state.setSessionTvLocalIds((prev) => new Map(prev).set(tvdbId, result.data.show.id));
            toast.success('TV show added to library');
          },
          onError: (err) => toast.error(`Failed to add TV show: ${err.message}`),
          onSettled: () => state.removeAdding(key),
        }
      );
    },
    [addTvShowMutation, state]
  );
}

export function useAddToWatchlistAndLibraryHandler({
  state,
  addMovieMutation,
  watchlistAddMutation,
}: HandlerArgs) {
  return useCallback(
    (tmdbId: number) => {
      const key = makeKey('movie', tmdbId);
      state.setAddingToWatchlistIds((prev) => new Set(prev).add(tmdbId));
      state.setAddingIds((prev) => new Set(prev).add(key));
      addMovieMutation.mutate(
        { tmdbId },
        {
          onSuccess: (result) => {
            const movieId = result.data.id;
            state.setAddedIds((prev) => new Set(prev).add(key));
            state.setSessionMovieLocalIds((prev) => new Map(prev).set(tmdbId, movieId));
            watchlistAddMutation.mutate(
              { mediaType: 'movie', mediaId: movieId },
              {
                onSuccess: () => toast.success('Added to watchlist and library'),
                onError: (err) =>
                  toast.error(`Movie added to library but watchlist failed: ${err.message}`),
                onSettled: () => state.removeFromSet(state.setAddingToWatchlistIds, tmdbId),
              }
            );
          },
          onError: (err) => {
            toast.error(`Failed to add movie: ${err.message}`);
            state.removeFromSet(state.setAddingToWatchlistIds, tmdbId);
          },
          onSettled: () => state.removeAdding(key),
        }
      );
    },
    [addMovieMutation, watchlistAddMutation, state]
  );
}

export function useMarkWatchedAndLibraryHandler({
  state,
  addMovieMutation,
  watchHistoryLogMutation,
}: HandlerArgs) {
  return useCallback(
    (tmdbId: number) => {
      const key = makeKey('movie', tmdbId);
      state.setMarkingWatchedTmdbIds((prev) => new Set(prev).add(tmdbId));
      state.setAddingIds((prev) => new Set(prev).add(key));
      addMovieMutation.mutate(
        { tmdbId },
        {
          onSuccess: (result) => {
            const movieId = result.data.id;
            state.setAddedIds((prev) => new Set(prev).add(key));
            state.setSessionMovieLocalIds((prev) => new Map(prev).set(tmdbId, movieId));
            watchHistoryLogMutation.mutate(
              { mediaType: 'movie', mediaId: movieId },
              {
                onSuccess: () => toast.success('Marked as watched and added to library'),
                onError: (err) =>
                  toast.error(`Movie added to library but watch log failed: ${err.message}`),
                onSettled: () => state.removeFromSet(state.setMarkingWatchedTmdbIds, tmdbId),
              }
            );
          },
          onError: (err) => {
            toast.error(`Failed to add movie: ${err.message}`);
            state.removeFromSet(state.setMarkingWatchedTmdbIds, tmdbId);
          },
          onSettled: () => state.removeAdding(key),
        }
      );
    },
    [addMovieMutation, watchHistoryLogMutation, state]
  );
}

export function useMarkWatchedHandler({ state, watchHistoryLogMutation }: HandlerArgs) {
  return useCallback(
    (mediaId: number) => {
      state.setMarkingWatchedMediaIds((prev) => new Set(prev).add(mediaId));
      watchHistoryLogMutation.mutate(
        { mediaType: 'movie', mediaId },
        {
          onSuccess: () => toast.success('Marked as watched'),
          onError: (err) => toast.error(`Failed to log watch: ${err.message}`),
          onSettled: () => state.removeFromSet(state.setMarkingWatchedMediaIds, mediaId),
        }
      );
    },
    [watchHistoryLogMutation, state]
  );
}
