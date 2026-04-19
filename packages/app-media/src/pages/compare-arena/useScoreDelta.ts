import { useCallback, useEffect, useRef, useState } from 'react';

import { buildScoreDelta } from './scoreDelta';

import type { trpc } from '@pops/api-client';

import type { DrawTier, ScoreDelta } from './types';

const DELTA_DISPLAY_MS = 1500;

export interface RecordVariables {
  mediaAId: number;
  mediaBId: number;
  winnerId: number;
  drawTier?: DrawTier | null;
}

interface FetchScoresArgs {
  variables: RecordVariables;
  dimensionId: number | null;
  utils: ReturnType<typeof trpc.useUtils>;
}

function getScoreFor(
  data: { data?: { dimensionId: number; score: number }[] | undefined } | undefined,
  dimensionId: number | null
): number {
  return data?.data?.find((s) => s.dimensionId === dimensionId)?.score ?? 1500;
}

async function fetchPairScores({ variables, dimensionId, utils }: FetchScoresArgs) {
  const isDraw = variables.winnerId === 0;
  const winnerId = isDraw ? variables.mediaAId : variables.winnerId;
  const loserId = variables.mediaAId === winnerId ? variables.mediaBId : variables.mediaAId;

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

  return {
    isDraw,
    winnerId,
    loserId,
    winnerScore: getScoreFor(scoresA, dimensionId),
    loserScore: getScoreFor(scoresB, dimensionId),
  };
}

export function useScoreDeltaTimer() {
  const [scoreDelta, setScoreDelta] = useState<ScoreDelta | null>(null);
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

  const scheduleClear = useCallback(() => {
    if (deltaTimerRef.current !== null) clearTimeout(deltaTimerRef.current);
    deltaTimerRef.current = setTimeout(() => {
      setScoreDelta(null);
      deltaTimerRef.current = null;
    }, DELTA_DISPLAY_MS);
  }, []);

  return { scoreDelta, setScoreDelta, scheduleClear };
}

export function useFetchScoreDelta(
  dimensionId: number | null,
  utils: ReturnType<typeof trpc.useUtils>,
  setScoreDelta: (d: ScoreDelta) => void
) {
  return useCallback(
    async (variables: RecordVariables): Promise<void> => {
      try {
        const result = await fetchPairScores({ variables, dimensionId, utils });
        setScoreDelta(
          buildScoreDelta({
            ...result,
            drawTier: variables.drawTier,
          })
        );
      } catch {
        // Score fetch failed — skip animation
      }
    },
    [utils, dimensionId, setScoreDelta]
  );
}
