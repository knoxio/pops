/** Elo K-factor for score updates. */
export const ELO_K = 32;

/** Map draw tier to ELO outcome value. High = both gain, Mid = neutral, Low = both lose. */
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

/** Calculate expected score for player A given ratings. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
