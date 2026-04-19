import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { buildScoreDelta } from './scoreDelta';

import type { DrawTier, PairData, ScoreDelta } from './types';

interface UseArenaActionsArgs {
  pair: PairData | null | undefined;
  dimensionId: number | null;
  resolveTitle: (mediaId: number) => string;
  onAfterAction: () => void;
}

interface RecordVariables {
  mediaAId: number;
  mediaBId: number;
  winnerId: number;
  drawTier?: DrawTier | null;
}

const DELTA_DISPLAY_MS = 1500;

/**
 * Encapsulates the comparison-recording side effects for the Compare Arena:
 * record / draw / skip mutations, ELO score-delta computation, and pair-related
 * destructive actions (markStale / N/A / blacklist).
 */
export function useArenaActions({
  pair,
  dimensionId,
  resolveTitle,
  onAfterAction,
}: UseArenaActionsArgs) {
  const utils = trpc.useUtils();
  const [scoreDelta, setScoreDelta] = useState<ScoreDelta | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (deltaTimerRef.current !== null) {
        clearTimeout(deltaTimerRef.current);
        deltaTimerRef.current = null;
      }
    },
    []
  );

  const fetchScoreDelta = useCallback(
    async (variables: RecordVariables): Promise<void> => {
      const isDraw = variables.winnerId === 0;
      const winnerId = isDraw ? variables.mediaAId : variables.winnerId;
      const loserId = variables.mediaAId === winnerId ? variables.mediaBId : variables.mediaAId;

      try {
        const [scoresA, scoresB] = await Promise.all([
          utils.media.comparisons.scores.fetch({
            mediaType: 'movie',
            mediaId: winnerId,
            dimensionId: dimensionId ?? undefined,
          }),
          utils.media.comparisons.scores.fetch({
            mediaType: 'movie',
            mediaId: loserId,
            dimensionId: dimensionId ?? undefined,
          }),
        ]);

        const winnerScore =
          scoresA?.data?.find((s: { dimensionId: number }) => s.dimensionId === dimensionId)
            ?.score ?? 1500;
        const loserScore =
          scoresB?.data?.find((s: { dimensionId: number }) => s.dimensionId === dimensionId)
            ?.score ?? 1500;

        setScoreDelta(
          buildScoreDelta({
            isDraw,
            winnerId,
            loserId,
            winnerScore,
            loserScore,
            drawTier: variables.drawTier,
          })
        );
      } catch {
        // Score fetch failed — skip animation
      }
    },
    [utils, dimensionId]
  );

  const recordMutation = trpc.media.comparisons.record.useMutation({
    onSuccess: async (_data: unknown, variables: RecordVariables) => {
      await fetchScoreDelta(variables);
      setSessionCount((c) => c + 1);
      onAfterAction();
      void utils.media.comparisons.getSmartPair.invalidate();
      if (deltaTimerRef.current !== null) clearTimeout(deltaTimerRef.current);
      deltaTimerRef.current = setTimeout(() => {
        setScoreDelta(null);
        deltaTimerRef.current = null;
      }, DELTA_DISPLAY_MS);
    },
  });

  const skipMutation = trpc.media.comparisons.recordSkip.useMutation({
    onSuccess: () => {
      toast.success('Pair skipped');
      onAfterAction();
      void utils.media.comparisons.getSmartPair.invalidate();
    },
  });

  const handlePick = useCallback(
    (winnerId: number) => {
      if (!pair || !dimensionId || recordMutation.isPending) return;
      recordMutation.mutate({
        dimensionId,
        mediaAType: 'movie' as const,
        mediaAId: pair.movieA.id,
        mediaBType: 'movie' as const,
        mediaBId: pair.movieB.id,
        winnerType: 'movie' as const,
        winnerId,
      });
    },
    [pair, dimensionId, recordMutation]
  );

  const handleSkip = useCallback(() => {
    if (!pair || !dimensionId || skipMutation.isPending) return;
    skipMutation.mutate({
      dimensionId,
      mediaAType: 'movie' as const,
      mediaAId: pair.movieA.id,
      mediaBType: 'movie' as const,
      mediaBId: pair.movieB.id,
    });
  }, [pair, dimensionId, skipMutation]);

  const handleDraw = useCallback(
    (tier: DrawTier) => {
      if (!pair || !dimensionId || recordMutation.isPending) return;
      recordMutation.mutate({
        dimensionId,
        mediaAType: 'movie' as const,
        mediaAId: pair.movieA.id,
        mediaBType: 'movie' as const,
        mediaBId: pair.movieB.id,
        winnerType: 'movie' as const,
        winnerId: 0,
        drawTier: tier,
      });
    },
    [pair, dimensionId, recordMutation]
  );

  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (data: { data: { staleness: number } }, variables: { mediaId: number }) => {
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(`${resolveTitle(variables.mediaId)} marked stale (×${timesMarked})`);
      onAfterAction();
      void utils.media.comparisons.getSmartPair.invalidate();
    },
  });

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: movieId });
    },
    [markStaleMutation]
  );

  const excludeMutation = trpc.media.comparisons.excludeFromDimension.useMutation();

  const handleNA = useCallback(
    (movieId: number) => {
      if (!dimensionId || excludeMutation.isPending) return;
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: movieId, dimensionId },
        {
          onSuccess: () => {
            toast.success(`${resolveTitle(movieId)} excluded from this dimension`);
            void utils.media.comparisons.getSmartPair.invalidate();
          },
        }
      );
    },
    [dimensionId, excludeMutation, resolveTitle, utils]
  );

  const isPending = recordMutation.isPending || scoreDelta !== null;

  return {
    sessionCount,
    scoreDelta,
    setScoreDelta,
    handlePick,
    handleSkip,
    handleDraw,
    handleMarkStale,
    handleNA,
    skipPending: skipMutation.isPending,
    markStalePending: markStaleMutation.isPending,
    naPending: excludeMutation.isPending,
    isPending,
  };
}
