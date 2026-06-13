import { useCallback } from 'react';
import { toast } from 'sonner';

import { usePillarMutation } from '@pops/pillar-sdk/react';

import type { DrawTier, PairData } from './types';
import type { MediaUtils, RecordVariables } from './useScoreDelta';

interface RecordInput {
  dimensionId: number;
  mediaAType: 'movie';
  mediaAId: number;
  mediaBType: 'movie';
  mediaBId: number;
  winnerType: 'movie';
  winnerId: number;
  drawTier?: DrawTier;
}

interface SkipInput {
  dimensionId: number;
  mediaAType: 'movie';
  mediaAId: number;
  mediaBType: 'movie';
  mediaBId: number;
}

interface RecordArgs {
  pair: PairData | null | undefined;
  dimensionId: number | null;
  utils: MediaUtils;
  fetchScoreDelta: (v: RecordVariables) => Promise<void>;
  onAfterAction: () => void;
  setSessionCount: React.Dispatch<React.SetStateAction<number>>;
  scheduleClear: () => void;
}

function useArenaMutations({
  utils,
  fetchScoreDelta,
  onAfterAction,
  setSessionCount,
  scheduleClear,
}: Omit<RecordArgs, 'pair' | 'dimensionId'>) {
  const recordMutation = usePillarMutation<RecordInput, unknown>(
    'media',
    ['comparisons', 'record'],
    {
      onSuccess: async (_data, variables) => {
        await fetchScoreDelta(variables);
        setSessionCount((c) => c + 1);
        onAfterAction();
        void utils.invalidate(['comparisons', 'getSmartPair']);
        scheduleClear();
      },
    }
  );

  const skipMutation = usePillarMutation<SkipInput, unknown>(
    'media',
    ['comparisons', 'recordSkip'],
    {
      onSuccess: () => {
        toast.success('Pair skipped');
        onAfterAction();
        void utils.invalidate(['comparisons', 'getSmartPair']);
      },
    }
  );

  return { recordMutation, skipMutation };
}

export function useArenaRecord(args: RecordArgs) {
  const { pair, dimensionId } = args;
  const { recordMutation, skipMutation } = useArenaMutations(args);

  const handlePick = useCallback(
    (winnerId: number) => {
      if (!pair || !dimensionId || recordMutation.isPending) return;
      recordMutation.mutate({
        dimensionId,
        mediaAType: 'movie',
        mediaAId: pair.movieA.id,
        mediaBType: 'movie',
        mediaBId: pair.movieB.id,
        winnerType: 'movie',
        winnerId,
      });
    },
    [pair, dimensionId, recordMutation]
  );

  const handleSkip = useCallback(() => {
    if (!pair || !dimensionId || skipMutation.isPending) return;
    skipMutation.mutate({
      dimensionId,
      mediaAType: 'movie',
      mediaAId: pair.movieA.id,
      mediaBType: 'movie',
      mediaBId: pair.movieB.id,
    });
  }, [pair, dimensionId, skipMutation]);

  const handleDraw = useCallback(
    (tier: DrawTier) => {
      if (!pair || !dimensionId || recordMutation.isPending) return;
      recordMutation.mutate({
        dimensionId,
        mediaAType: 'movie',
        mediaAId: pair.movieA.id,
        mediaBType: 'movie',
        mediaBId: pair.movieB.id,
        winnerType: 'movie',
        winnerId: 0,
        drawTier: tier,
      });
    },
    [pair, dimensionId, recordMutation]
  );

  return { recordMutation, skipMutation, handlePick, handleSkip, handleDraw };
}
