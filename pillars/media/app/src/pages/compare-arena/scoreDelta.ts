import type { DrawTier, ScoreDelta } from './types';

const ELO_K = 32;

function expectedScore(scoreA: number, scoreB: number): number {
  return 1 / (1 + Math.pow(10, (scoreB - scoreA) / 400));
}

export function computeDrawDelta(
  scoreA: number,
  scoreB: number,
  tier: DrawTier | null | undefined
): number {
  const drawOutcome = (() => {
    if (tier === 'high') return 0.7;
    if (tier === 'low') return 0.3;
    return 0.5;
  })();
  return Math.round(ELO_K * (drawOutcome - expectedScore(scoreA, scoreB)));
}

export function computeWinDelta(scoreA: number, scoreB: number): number {
  return Math.round(ELO_K * (1 - expectedScore(scoreA, scoreB)));
}

interface ComputeScoreDeltaArgs {
  isDraw: boolean;
  winnerId: number;
  loserId: number;
  winnerScore: number;
  loserScore: number;
  drawTier?: DrawTier | null;
}

export function buildScoreDelta({
  isDraw,
  winnerId,
  loserId,
  winnerScore,
  loserScore,
  drawTier,
}: ComputeScoreDeltaArgs): ScoreDelta {
  if (isDraw) {
    const delta = computeDrawDelta(winnerScore, loserScore, drawTier);
    return { winnerId, loserId, winnerDelta: delta, loserDelta: delta, isDraw: true };
  }
  const winnerDelta = computeWinDelta(winnerScore, loserScore);
  return { winnerId, loserId, winnerDelta, loserDelta: -winnerDelta, isDraw: false };
}
