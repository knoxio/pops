import { getOverallRankings } from './rankings-overall.js';
import { getPerDimensionRankings } from './rankings-per-dimension.js';

import type { RankedMediaEntry } from './types.js';

export { resolvePosterUrl } from './rankings-helpers.js';

export interface RankingsResult {
  rows: RankedMediaEntry[];
  total: number;
}

export function getRankings(
  dimensionId: number | undefined,
  mediaType: string | undefined,
  limit: number,
  offset: number
): RankingsResult {
  if (dimensionId !== undefined) {
    return getPerDimensionRankings({ dimensionId, mediaType, limit, offset });
  }
  return getOverallRankings({ mediaType, limit, offset });
}
