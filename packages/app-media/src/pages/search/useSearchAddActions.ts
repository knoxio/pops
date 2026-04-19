import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { SearchResultType } from '../../components/SearchResultCard';

const makeKey = (type: SearchResultType, id: number) => `${type}:${id}`;

/**
 * Encapsulates "Add to library" mutations for movies and TV shows, plus
 * compound flows ("watchlist + library", "watched + library") and the
 * pending/added bookkeeping used by the SearchPage cards.
 */
export function useSearchAddActions() {
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingToWatchlistIds, setAddingToWatchlistIds] = useState<Set<number>>(new Set());
  const [markingWatchedTmdbIds, setMarkingWatchedTmdbIds] = useState<Set<number>>(new Set());
  const [markingWatchedMediaIds, setMarkingWatchedMediaIds] = useState<Set<number>>(new Set());
  const [sessionMovieLocalIds, setSessionMovieLocalIds] = useState<Map<number, number>>(new Map());
  const [sessionTvLocalIds, setSessionTvLocalIds] = useState<Map<number, number>>(new Map());

  const addMovieMutation = trpc.media.library.addMovie.useMutation();
  const addTvShowMutation = trpc.media.library.addTvShow.useMutation();
  const watchlistAddMutation = trpc.media.watchlist.add.useMutation();
  const watchHistoryLogMutation = trpc.media.watchHistory.log.useMutation();

  const removeAdding = useCallback((key: string) => {
    setAddingIds((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const removeFromSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
      setter((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    []
  );

  const handleAddMovie = useCallback(
    (tmdbId: number) => {
      const key = makeKey('movie', tmdbId);
      setAddingIds((prev) => new Set(prev).add(key));
      addMovieMutation.mutate(
        { tmdbId },
        {
          onSuccess: (result) => {
            setAddedIds((prev) => new Set(prev).add(key));
            setSessionMovieLocalIds((prev) => new Map(prev).set(tmdbId, result.data.id));
            toast.success('Movie added to library');
          },
          onError: (err: { message: string }) => toast.error(`Failed to add movie: ${err.message}`),
          onSettled: () => removeAdding(key),
        }
      );
    },
    [addMovieMutation, removeAdding]
  );

  const handleAddTvShow = useCallback(
    (tvdbId: number) => {
      const key = makeKey('tv', tvdbId);
      setAddingIds((prev) => new Set(prev).add(key));
      addTvShowMutation.mutate(
        { tvdbId },
        {
          onSuccess: (result) => {
            setAddedIds((prev) => new Set(prev).add(key));
            setSessionTvLocalIds((prev) => new Map(prev).set(tvdbId, result.data.show.id));
            toast.success('TV show added to library');
          },
          onError: (err: { message: string }) =>
            toast.error(`Failed to add TV show: ${err.message}`),
          onSettled: () => removeAdding(key),
        }
      );
    },
    [addTvShowMutation, removeAdding]
  );

  const handleAddToWatchlistAndLibrary = useCallback(
    (tmdbId: number) => {
      const key = makeKey('movie', tmdbId);
      setAddingToWatchlistIds((prev) => new Set(prev).add(tmdbId));
      setAddingIds((prev) => new Set(prev).add(key));
      addMovieMutation.mutate(
        { tmdbId },
        {
          onSuccess: (result) => {
            const movieId = result.data.id;
            setAddedIds((prev) => new Set(prev).add(key));
            setSessionMovieLocalIds((prev) => new Map(prev).set(tmdbId, movieId));
            watchlistAddMutation.mutate(
              { mediaType: 'movie', mediaId: movieId },
              {
                onSuccess: () => toast.success('Added to watchlist and library'),
                onError: (err: { message: string }) =>
                  toast.error(`Movie added to library but watchlist failed: ${err.message}`),
                onSettled: () => removeFromSet(setAddingToWatchlistIds, tmdbId),
              }
            );
          },
          onError: (err: { message: string }) => {
            toast.error(`Failed to add movie: ${err.message}`);
            removeFromSet(setAddingToWatchlistIds, tmdbId);
          },
          onSettled: () => removeAdding(key),
        }
      );
    },
    [addMovieMutation, watchlistAddMutation, removeAdding, removeFromSet]
  );

  const handleMarkWatchedAndLibrary = useCallback(
    (tmdbId: number) => {
      const key = makeKey('movie', tmdbId);
      setMarkingWatchedTmdbIds((prev) => new Set(prev).add(tmdbId));
      setAddingIds((prev) => new Set(prev).add(key));
      addMovieMutation.mutate(
        { tmdbId },
        {
          onSuccess: (result) => {
            const movieId = result.data.id;
            setAddedIds((prev) => new Set(prev).add(key));
            setSessionMovieLocalIds((prev) => new Map(prev).set(tmdbId, movieId));
            watchHistoryLogMutation.mutate(
              { mediaType: 'movie', mediaId: movieId },
              {
                onSuccess: () => toast.success('Marked as watched and added to library'),
                onError: (err: { message: string }) =>
                  toast.error(`Movie added to library but watch log failed: ${err.message}`),
                onSettled: () => removeFromSet(setMarkingWatchedTmdbIds, tmdbId),
              }
            );
          },
          onError: (err: { message: string }) => {
            toast.error(`Failed to add movie: ${err.message}`);
            removeFromSet(setMarkingWatchedTmdbIds, tmdbId);
          },
          onSettled: () => removeAdding(key),
        }
      );
    },
    [addMovieMutation, watchHistoryLogMutation, removeAdding, removeFromSet]
  );

  const handleMarkWatched = useCallback(
    (mediaId: number) => {
      setMarkingWatchedMediaIds((prev) => new Set(prev).add(mediaId));
      watchHistoryLogMutation.mutate(
        { mediaType: 'movie', mediaId },
        {
          onSuccess: () => toast.success('Marked as watched'),
          onError: (err: { message: string }) => toast.error(`Failed to log watch: ${err.message}`),
          onSettled: () => removeFromSet(setMarkingWatchedMediaIds, mediaId),
        }
      );
    },
    [watchHistoryLogMutation, removeFromSet]
  );

  return {
    addingIds,
    addedIds,
    addingToWatchlistIds,
    markingWatchedTmdbIds,
    markingWatchedMediaIds,
    sessionMovieLocalIds,
    sessionTvLocalIds,
    handleAddMovie,
    handleAddTvShow,
    handleAddToWatchlistAndLibrary,
    handleMarkWatchedAndLibrary,
    handleMarkWatched,
    makeKey,
  };
}
