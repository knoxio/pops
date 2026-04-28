import { getSettingValue } from '../../../core/settings/service.js';

/** Elo K-factor for score updates (configurable via settings). */
export const ELO_K = 32;

/** Read the ELO K-factor from settings, falling back to the compile-time default. */
export function getEloK(): number {
  return getSettingValue('media.comparisons.eloK', ELO_K);
}

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
