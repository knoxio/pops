import { TMDB_GENRE_MAP } from './types.js';

import type { DiscoverResult, PreferenceProfile, ScoredDiscoverResult } from './types.js';

function buildAffinityMap(profile: PreferenceProfile): Map<string, number> {
  const map = new Map<string, number>();
  if (profile.genreAffinities.length > 0) {
    const maxScore = Math.max(...profile.genreAffinities.map((a) => a.avgScore));
    const minScore = Math.min(...profile.genreAffinities.map((a) => a.avgScore));
    const range = maxScore - minScore || 1;
    for (const a of profile.genreAffinities) {
      map.set(a.genre, (a.avgScore - minScore) / range);
    }
  }
  if (map.size === 0 && profile.genreDistribution.length > 0) {
    const maxPct = Math.max(...profile.genreDistribution.map((g) => g.percentage));
    for (const g of profile.genreDistribution) {
      map.set(g.genre, maxPct > 0 ? g.percentage / maxPct : 0);
    }
  }
  return map;
}

interface ScoreResult {
  matchPercentage: number;
  matchReason: string;
}

function scoreSingleResult(result: DiscoverResult, affinityMap: Map<string, number>): ScoreResult {
  const genreNames = result.genreIds
    .map((id) => TMDB_GENRE_MAP[id])
    .filter((name): name is string => name != null);
  if (genreNames.length === 0 || affinityMap.size === 0) {
    return { matchPercentage: 0, matchReason: '' };
  }
  let totalScore = 0;
  const matchedGenres: { name: string; score: number }[] = [];
  for (const genre of genreNames) {
    const score = affinityMap.get(genre) ?? 0;
    totalScore += score;
    if (score > 0) matchedGenres.push({ name: genre, score });
  }
  const avgScore = totalScore / genreNames.length;
  const matchPercentage = Math.round(50 + avgScore * 48);
  matchedGenres.sort((a, b) => b.score - a.score);
  const matchReason = matchedGenres
    .slice(0, 3)
    .map((g) => g.name)
    .join(', ');
  return { matchPercentage, matchReason };
}

/**
 * Score recommendation results against the user's preference profile.
 *
 * For each result, maps TMDB genre IDs to genre names, looks up the user's
 * genre affinity scores, and computes a weighted match percentage.
 * Results are sorted by matchPercentage descending.
 */
export function scoreDiscoverResults(
  results: DiscoverResult[],
  profile: PreferenceProfile
): ScoredDiscoverResult[] {
  const affinityMap = buildAffinityMap(profile);
  return results
    .map((result) => ({
      ...result,
      ...scoreSingleResult(result, affinityMap),
    }))
    .toSorted((a, b) => b.matchPercentage - a.matchPercentage);
}
