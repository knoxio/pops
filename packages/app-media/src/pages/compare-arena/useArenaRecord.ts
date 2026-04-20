import { useCallback } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { DrawTier, PairData } from './types';
import type { RecordVariables } from './useScoreDelta';

interface RecordArgs {
  pair: PairData | null | undefined;
  dimensionId: number | null;
  utils: ReturnType<typeof trpc.useUtils>;
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
  const recordMutation = trpc.media.comparisons.record.useMutation({
    onSuccess: async (_data: unknown, variables: RecordVariables) => {
      await fetchScoreDelta(variables);
      setSessionCount((c) => c + 1);
      onAfterAction();
      void utils.media.comparisons.getSmartPair.invalidate();
      scheduleClear();
    },
  });

  const skipMutation = trpc.media.comparisons.recordSkip.useMutation({
    onSuccess: () => {
      toast.success('Pair skipped');
      onAfterAction();
      void utils.media.comparisons.getSmartPair.invalidate();
    },
  });

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
