/**
 * TMDB trending orchestration — fetches a page of trending movies and
 * annotates them with library/watch flags, dropping dismissed items.
 *
 * Ported from the monolith `tmdb-service.getTrending`.
 */
import { loadFlagSets, type DiscoveryDeps } from './deps.js';
import { toDiscoverResults } from './discover-result-mapper.js';

import type { DiscoverResult } from '../../../db/index.js';

export interface TrendingResult {
  results: DiscoverResult[];
  totalResults: number;
  page: number;
}

/** Trending movies for the given window + page, flag-annotated, dismissed-filtered. */
export async function getTrending(
  deps: DiscoveryDeps,
  timeWindow: 'day' | 'week',
  page: number
): Promise<TrendingResult> {
  const response = await deps.tmdbClient.getTrendingMovies(timeWindow, page);
  const flags = loadFlagSets(deps.db);
  return {
    results: toDiscoverResults(response.results, flags),
    totalResults: response.totalResults,
    page: response.page,
  };
}
