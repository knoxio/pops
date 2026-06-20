import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrap } from '../../media-api-helpers.js';
import { comparisonsScores } from '../../media-api/index.js';
import { buildScoreDelta } from './scoreDelta';

import type { QueryClient } from '@tanstack/react-query';

import type { DrawTier, ScoreDelta } from './types';

const DELTA_DISPLAY_MS = 1500;

export type MediaQueryClient = QueryClient;

export interface RecordVariables {
  mediaAId: number;
  mediaBId: number;
  winnerId: number;
  drawTier?: DrawTier | null;
}

interface ScoresResult {
  data?: { dimensionId: number; score: number }[];
}

interface FetchScoresArgs {
  variables: RecordVariables;
  dimensionId: number | null;
  queryClient: MediaQueryClient;
}

function getScoreFor(data: ScoresResult | undefined, dimensionId: number | null): number {
  return data?.data?.find((s) => s.dimensionId === dimensionId)?.score ?? 1500;
}

function fetchScoresFor(
  queryClient: MediaQueryClient,
  mediaId: number,
  dimensionId: number | null
): Promise<ScoresResult> {
  const query = {
    mediaType: 'movie' as const,
    mediaId,
    ...(dimensionId !== null ? { dimensionId } : {}),
  };
  return queryClient.fetchQuery({
    queryKey: ['media', 'comparisons', 'scores', query],
    queryFn: async () => unwrap(await comparisonsScores({ query })),
  });
}

async function fetchPairScores({ variables, dimensionId, queryClient }: FetchScoresArgs) {
  const isDraw = variables.winnerId === 0;
  const winnerId = isDraw ? variables.mediaAId : variables.winnerId;
  const loserId = variables.mediaAId === winnerId ? variables.mediaBId : variables.mediaAId;

  const [scoresA, scoresB] = await Promise.all([
    fetchScoresFor(queryClient, winnerId, dimensionId),
    fetchScoresFor(queryClient, loserId, dimensionId),
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
  queryClient: MediaQueryClient,
  setScoreDelta: (d: ScoreDelta) => void
) {
  return useCallback(
    async (variables: RecordVariables): Promise<void> => {
      try {
        const result = await fetchPairScores({ variables, dimensionId, queryClient });
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
    [queryClient, dimensionId, setScoreDelta]
  );
}
