import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useArenaRecord } from './useArenaRecord';
import { useFetchScoreDelta, useScoreDeltaTimer } from './useScoreDelta';
import { useStaleAndExcludeMutations } from './useStaleAndExclude';

import type { PairData } from './types';

interface UseArenaActionsArgs {
  pair: PairData | null | undefined;
  dimensionId: number | null;
  resolveTitle: (mediaId: number) => string;
  onAfterAction: () => void;
}

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
  const queryClient = useQueryClient();
  const [sessionCount, setSessionCount] = useState(0);
  const { scoreDelta, setScoreDelta, scheduleClear } = useScoreDeltaTimer();
  const fetchScoreDelta = useFetchScoreDelta(dimensionId, queryClient, setScoreDelta);

  const { recordMutation, skipMutation, handlePick, handleSkip, handleDraw } = useArenaRecord({
    pair,
    dimensionId,
    queryClient,
    fetchScoreDelta,
    onAfterAction,
    setSessionCount,
    scheduleClear,
  });

  const { markStaleMutation, handleMarkStale, excludeMutation, handleNA } =
    useStaleAndExcludeMutations({
      dimensionId,
      queryClient,
      resolveTitle,
      onAfterAction,
    });

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
