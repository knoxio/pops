import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import {
  comparisonsBlacklistMovie,
  comparisonsExcludeFromDimension,
  comparisonsMarkStale,
} from '../../media-api/index.js';

import type { TierMovie } from '../../components/TierListBoard';

interface MediaVars {
  mediaType: 'movie';
  mediaId: number;
}

interface ExcludeFromDimensionInput extends MediaVars {
  dimensionId: number;
}

function useStaleAndNa({
  movies,
  effectiveDimension,
  refetch,
}: {
  movies: TierMovie[];
  effectiveDimension: number | null;
  refetch: () => void;
}) {
  const markStaleMutation = useMutation({
    mutationFn: async (variables: MediaVars) =>
      unwrap(await comparisonsMarkStale({ body: variables })),
    onSuccess: (data, variables) => {
      const movie = movies.find((m) => m.mediaId === variables.mediaId);
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(`${movie?.title ?? 'Movie'} marked stale (×${timesMarked})`);
      refetch();
    },
  });

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: movieId });
    },
    [markStaleMutation]
  );

  const excludeMutation = useMutation({
    mutationFn: async (variables: ExcludeFromDimensionInput) =>
      unwrap(await comparisonsExcludeFromDimension({ body: variables })),
    onSuccess: () => refetch(),
  });

  const handleNA = useCallback(
    (movieId: number) => {
      if (!effectiveDimension || excludeMutation.isPending) return;
      const movie = movies.find((m) => m.mediaId === movieId);
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: movieId, dimensionId: effectiveDimension },
        {
          onSuccess: () => {
            toast.success(`${movie?.title ?? 'Movie'} excluded from this dimension`);
          },
        }
      );
    },
    [effectiveDimension, excludeMutation, movies]
  );

  return { handleMarkStale, handleNA };
}

function useBlacklistFlow({ movies, refetch }: { movies: TierMovie[]; refetch: () => void }) {
  const queryClient = useQueryClient();
  const [blacklistTarget, setBlacklistTarget] = useState<{ id: number; title: string } | null>(
    null
  );

  const blacklistMutation = useMutation({
    mutationFn: async (variables: MediaVars) =>
      unwrap(await comparisonsBlacklistMovie({ body: variables })),
    onSuccess: (_data, variables) => {
      const movie = movies.find((m) => m.mediaId === variables.mediaId);
      toast.success(`${movie?.title ?? 'Movie'} marked as not watched`);
      setBlacklistTarget(null);
      refetch();
      void queryClient.invalidateQueries({ queryKey: ['media', 'comparisons', 'getSmartPair'] });
    },
  });

  const handleNotWatched = useCallback(
    (movieId: number) => {
      const movie = movies.find((m) => m.mediaId === movieId);
      if (movie) setBlacklistTarget({ id: movie.mediaId, title: movie.title });
    },
    [movies]
  );

  return { handleNotWatched, blacklistTarget, setBlacklistTarget, blacklistMutation };
}

export function useTierListMutations({
  movies,
  effectiveDimension,
  refetch,
}: {
  movies: TierMovie[];
  effectiveDimension: number | null;
  refetch: () => void;
}) {
  const stale = useStaleAndNa({ movies, effectiveDimension, refetch });
  const blacklist = useBlacklistFlow({ movies, refetch });
  return { ...stale, ...blacklist };
}
