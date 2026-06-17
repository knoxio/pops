/**
 * Pure tier-to-comparison conversion — transform tier placements into implied
 * pairwise comparisons. No DB access.
 */
import { type Tier, TIER_RANK_ORDER } from './mappers.js';

export interface TierPlacement {
  movieId: number;
  tier: Tier;
}

export interface PairwiseComparison {
  mediaAId: number;
  mediaBId: number;
  winnerId: number;
  drawTier: 'high' | 'mid' | 'low' | null;
}

/** Same-tier draw mapping: S/A=high, B=mid, C/D=low. */
const TIER_DRAW_MAP: Record<Tier, 'high' | 'mid' | 'low'> = {
  S: 'high',
  A: 'high',
  B: 'mid',
  C: 'low',
  D: 'low',
};

/**
 * Convert N placements into C(N,2) pairwise comparisons. Same tier → draw with
 * the tier-mapped draw tier; different tiers → the higher tier (lower rank
 * number) wins.
 */
export function convertTierPlacements(placements: TierPlacement[]): PairwiseComparison[] {
  const results: PairwiseComparison[] = [];

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      if (!a || !b) continue;

      const rankA = TIER_RANK_ORDER[a.tier];
      const rankB = TIER_RANK_ORDER[b.tier];

      if (rankA === rankB) {
        results.push({
          mediaAId: a.movieId,
          mediaBId: b.movieId,
          winnerId: 0,
          drawTier: TIER_DRAW_MAP[a.tier],
        });
      } else {
        results.push({
          mediaAId: a.movieId,
          mediaBId: b.movieId,
          winnerId: rankA < rankB ? a.movieId : b.movieId,
          drawTier: null,
        });
      }
    }
  }

  return results;
}
