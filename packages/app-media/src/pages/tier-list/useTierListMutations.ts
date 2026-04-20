import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { TierMovie } from '../../components/TierListBoard';

function useStaleAndNa({
  movies,
  effectiveDimension,
  refetch,
}: {
  movies: TierMovie[];
  effectiveDimension: number | null;
  refetch: () => void;
}) {
  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (
      data: { data: { staleness: number } },
      variables: { mediaType: string; mediaId: number }
    ) => {
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

  const excludeMutation = trpc.media.comparisons.excludeFromDimension.useMutation({
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
  const utils = trpc.useUtils();
  const [blacklistTarget, setBlacklistTarget] = useState<{ id: number; title: string } | null>(
    null
  );

  const blacklistMutation = trpc.media.comparisons.blacklistMovie.useMutation({
    onSuccess: (_data: unknown, variables: { mediaType: string; mediaId: number }) => {
      const movie = movies.find((m) => m.mediaId === variables.mediaId);
      toast.success(`${movie?.title ?? 'Movie'} marked as not watched`);
      setBlacklistTarget(null);
      refetch();
      void utils.media.comparisons.getSmartPair.invalidate();
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
