/**
 * Pure ELO math for the comparisons ranking engine. No DB access.
 */
import { getEloK } from './config.js';

export { getEloK };

/** Map a draw tier to an ELO outcome. High = both gain, Mid = neutral, Low = both lose. */
export function drawTierOutcome(tier: string | null | undefined): number {
  switch (tier) {
    case 'high':
      return 0.7;
    case 'low':
      return 0.3;
    default:
      return 0.5;
  }
}

/** Expected score for player A given both ratings (standard ELO logistic). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
