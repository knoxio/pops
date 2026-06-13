import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { TierMovie } from '../../components/TierListBoard';

interface MediaVars {
  mediaType: 'movie';
  mediaId: number;
}

interface MarkStaleResponse {
  data: { staleness: number };
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
  const markStaleMutation = usePillarMutation<MediaVars, MarkStaleResponse>(
    'media',
    ['comparisons', 'markStale'],
    {
      onSuccess: (data, variables) => {
        const movie = movies.find((m) => m.mediaId === variables.mediaId);
        const staleness = data.data.staleness;
        const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
        toast.success(`${movie?.title ?? 'Movie'} marked stale (×${timesMarked})`);
        refetch();
      },
    }
  );

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: movieId });
    },
    [markStaleMutation]
  );

  const excludeMutation = usePillarMutation<ExcludeFromDimensionInput, unknown>(
    'media',
    ['comparisons', 'excludeFromDimension'],
    {
      onSuccess: () => refetch(),
    }
  );

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
  const utils = usePillarUtils('media');
  const [blacklistTarget, setBlacklistTarget] = useState<{ id: number; title: string } | null>(
    null
  );

  const blacklistMutation = usePillarMutation<MediaVars, unknown>(
    'media',
    ['comparisons', 'blacklistMovie'],
    {
      onSuccess: (_data, variables) => {
        const movie = movies.find((m) => m.mediaId === variables.mediaId);
        toast.success(`${movie?.title ?? 'Movie'} marked as not watched`);
        setBlacklistTarget(null);
        refetch();
        void utils.invalidate(['comparisons', 'getSmartPair']);
      },
    }
  );

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
