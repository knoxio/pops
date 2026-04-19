export interface ScoreDelta {
  winnerId: number;
  loserId: number;
  winnerDelta: number;
  loserDelta: number;
  isDraw: boolean;
}

export interface PairMovie {
  id: number;
  title: string;
  posterUrl: string | null;
}

export interface PairData {
  movieA: PairMovie;
  movieB: PairMovie;
  dimensionId: number | null;
}

export interface Dimension {
  id: number;
  name: string;
  active: boolean;
  description?: string | null;
}

export type DrawTier = 'high' | 'mid' | 'low';
