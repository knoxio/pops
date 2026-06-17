/**
 * Non-TMDB discovery reads: the scored "from your server" list and the
 * scored-recommendations wrapper that applies the cold-start guard.
 *
 * `fromYourServer` scores unwatched library movies by the preference profile
 * (local-only, no upstream call). `getScoredRecommendations` mirrors the
 * monolith `recommendations` procedure: below 5 comparisons it returns an
 * empty result without calling TMDB.
 *
 * Ported from the monolith `router-basic.fromYourServer` + `router-tmdb.recommendations`.
 */
import { type MediaDb, discoveryService } from '../../../db/index.js';
import { getRecommendations } from './recommendations.js';

import type { ScoredDiscoverResult } from '../../../db/index.js';
import type { DiscoveryDeps } from './deps.js';

const RECOMMENDATIONS_MIN_COMPARISONS = 5;

/** Unwatched library movies scored by the profile, top 20. */
export function getFromYourServer(db: MediaDb): { results: ScoredDiscoverResult[] } {
  const unwatched = discoveryService.getUnwatchedLibraryMovies(db);
  if (unwatched.length === 0) return { results: [] };
  const profile = discoveryService.getPreferenceProfile(db);
  const scored = discoveryService.scoreDiscoverResults(unwatched, profile);
  return { results: scored.slice(0, 20) };
}

export interface ScoredRecommendationsResult {
  results: ScoredDiscoverResult[];
  sourceMovies: string[];
  totalComparisons: number;
}

/** Profile-scored TMDB recommendations, guarded below the cold-start threshold. */
export async function getScoredRecommendations(
  deps: DiscoveryDeps,
  sampleSize: number
): Promise<ScoredRecommendationsResult> {
  const profile = discoveryService.getPreferenceProfile(deps.db);
  if (profile.totalComparisons < RECOMMENDATIONS_MIN_COMPARISONS) {
    return { results: [], sourceMovies: [], totalComparisons: profile.totalComparisons };
  }
  const raw = await getRecommendations(deps, sampleSize);
  return {
    results: discoveryService.scoreDiscoverResults(raw.results, profile),
    sourceMovies: raw.sourceMovies,
    totalComparisons: profile.totalComparisons,
  };
}
