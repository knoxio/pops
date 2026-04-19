import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface UseDebriefDestructiveActionsArgs {
  movieId: number;
  currentDimensionId: number | null;
  resolveTitle: (id: number) => string;
}

/**
 * markStale, N/A exclude, and blacklist (Not Watched) mutations for the
 * Debrief flow. Returns mutation handlers and blacklist dialog state.
 */
export function useDebriefDestructiveActions({
  movieId,
  currentDimensionId,
  resolveTitle,
}: UseDebriefDestructiveActionsArgs) {
  const utils = trpc.useUtils();

  const invalidateDebrief = useCallback(() => {
    void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
  }, [utils, movieId]);

  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (data: { data: { staleness: number } }, variables: { mediaId: number }) => {
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(`${resolveTitle(variables.mediaId)} marked stale (×${timesMarked})`);
      invalidateDebrief();
    },
  });

  const handleMarkStale = useCallback(
    (id: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: id });
    },
    [markStaleMutation]
  );

  const excludeMutation = trpc.media.comparisons.excludeFromDimension.useMutation();

  const handleNA = useCallback(
    (id: number) => {
      if (currentDimensionId == null || excludeMutation.isPending) return;
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: id, dimensionId: currentDimensionId },
        {
          onSuccess: () => {
            toast.success(`${resolveTitle(id)} excluded from this dimension`);
            invalidateDebrief();
          },
        }
      );
    },
    [currentDimensionId, excludeMutation, resolveTitle, invalidateDebrief]
  );

  const [blacklistTarget, setBlacklistTarget] = useState<{ id: number; title: string } | null>(
    null
  );

  const { data: blacklistComparisonData } = trpc.media.comparisons.listForMedia.useQuery(
    { mediaType: 'movie', mediaId: blacklistTarget?.id ?? 0, limit: 1 },
    { enabled: blacklistTarget !== null }
  );
  const comparisonsToPurge = blacklistComparisonData?.pagination?.total ?? null;

  const blacklistMutation = trpc.media.comparisons.blacklistMovie.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`${resolveTitle(variables.mediaId)} marked as not watched`);
      setBlacklistTarget(null);
      invalidateDebrief();
    },
  });

  const openBlacklist = useCallback((movie: { id: number; title: string }) => {
    setBlacklistTarget(movie);
  }, []);

  const cancelBlacklist = useCallback(() => setBlacklistTarget(null), []);

  const confirmBlacklist = useCallback(() => {
    if (!blacklistTarget) return;
    blacklistMutation.mutate({ mediaType: 'movie', mediaId: blacklistTarget.id });
  }, [blacklistTarget, blacklistMutation]);

  return {
    handleMarkStale,
    markStalePending: markStaleMutation.isPending,
    handleNA,
    naPending: excludeMutation.isPending,
    blacklistTarget,
    comparisonsToPurge,
    blacklistPending: blacklistMutation.isPending,
    openBlacklist,
    cancelBlacklist,
    confirmBlacklist,
  };
}
