import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

interface UseDebriefDestructiveActionsArgs {
  currentDimensionId: number | null;
  resolveTitle: (id: number) => string;
}

interface MarkStaleResult {
  data: { staleness: number };
}

interface MarkStaleInput {
  mediaType: 'movie';
  mediaId: number;
}

interface ExcludeInput {
  mediaType: 'movie';
  mediaId: number;
  dimensionId: number;
}

interface BlacklistInput {
  mediaType: 'movie';
  mediaId: number;
}

interface ComparisonsListResult {
  pagination?: { total: number };
}

function useStaleAndExclude({
  invalidateDebrief,
  resolveTitle,
  currentDimensionId,
}: {
  invalidateDebrief: () => void;
  resolveTitle: (id: number) => string;
  currentDimensionId: number | null;
}) {
  const markStaleMutation = usePillarMutation<MarkStaleInput, MarkStaleResult>(
    'media',
    ['comparisons', 'markStale'],
    {
      onSuccess: (data, variables) => {
        const staleness = data.data.staleness;
        const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
        toast.success(`${resolveTitle(variables.mediaId)} marked stale (×${timesMarked})`);
        invalidateDebrief();
      },
    }
  );

  const handleMarkStale = useCallback(
    (id: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: id });
    },
    [markStaleMutation]
  );

  const excludeMutation = usePillarMutation<ExcludeInput, unknown>('media', [
    'comparisons',
    'excludeFromDimension',
  ]);

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

  return { handleMarkStale, markStaleMutation, handleNA, excludeMutation };
}

function useBlacklistFlow({
  invalidateDebrief,
  resolveTitle,
}: {
  invalidateDebrief: () => void;
  resolveTitle: (id: number) => string;
}) {
  const [blacklistTarget, setBlacklistTarget] = useState<{ id: number; title: string } | null>(
    null
  );

  const { data: blacklistComparisonData } = usePillarQuery<ComparisonsListResult>(
    'media',
    ['comparisons', 'listForMedia'],
    { mediaType: 'movie', mediaId: blacklistTarget?.id ?? 0, limit: 1 },
    { enabled: blacklistTarget !== null }
  );
  const comparisonsToPurge = blacklistComparisonData?.pagination?.total ?? null;

  const blacklistMutation = usePillarMutation<BlacklistInput, unknown>(
    'media',
    ['comparisons', 'blacklistMovie'],
    {
      onSuccess: (_data, variables) => {
        toast.success(`${resolveTitle(variables.mediaId)} marked as not watched`);
        setBlacklistTarget(null);
        invalidateDebrief();
      },
    }
  );

  const openBlacklist = useCallback((movie: { id: number; title: string }) => {
    setBlacklistTarget(movie);
  }, []);
  const cancelBlacklist = useCallback(() => setBlacklistTarget(null), []);
  const confirmBlacklist = useCallback(() => {
    if (!blacklistTarget) return;
    blacklistMutation.mutate({ mediaType: 'movie', mediaId: blacklistTarget.id });
  }, [blacklistTarget, blacklistMutation]);

  return {
    blacklistTarget,
    comparisonsToPurge,
    blacklistMutation,
    openBlacklist,
    cancelBlacklist,
    confirmBlacklist,
  };
}

export function useDebriefDestructiveActions({
  currentDimensionId,
  resolveTitle,
}: UseDebriefDestructiveActionsArgs) {
  const utils = usePillarUtils('media');

  const invalidateDebrief = useCallback(() => {
    void utils.invalidate(['comparisons', 'getDebrief']);
  }, [utils]);

  const stale = useStaleAndExclude({ invalidateDebrief, resolveTitle, currentDimensionId });
  const blacklist = useBlacklistFlow({ invalidateDebrief, resolveTitle });

  return {
    handleMarkStale: stale.handleMarkStale,
    markStalePending: stale.markStaleMutation.isPending,
    handleNA: stale.handleNA,
    naPending: stale.excludeMutation.isPending,
    blacklistTarget: blacklist.blacklistTarget,
    comparisonsToPurge: blacklist.comparisonsToPurge,
    blacklistPending: blacklist.blacklistMutation.isPending,
    openBlacklist: blacklist.openBlacklist,
    cancelBlacklist: blacklist.cancelBlacklist,
    confirmBlacklist: blacklist.confirmBlacklist,
  };
}
