/**
 * TMDB recommendation orchestration — recommendations seeded from the user's
 * top-rated library movies, and similar-to recommendations seeded from the
 * watchlist (scored by the preference profile).
 *
 * Ported from the monolith `tmdb-service.getRecommendations` +
 * `getWatchlistRecommendations`.
 */
import { discoveryService } from '../../../db/index.js';
import { loadFlagSets, type DiscoveryDeps } from './deps.js';
import { buildPosterUrl, type FlagSets } from './discover-result-mapper.js';

import type { DiscoverResult, ScoredDiscoverResult } from '../../../db/index.js';
import type { TmdbSearchResult } from '../../clients/tmdb/index.js';

export interface RecommendationsResult {
  results: DiscoverResult[];
  sourceMovies: string[];
}

export interface WatchlistRecommendationsResult {
  results: ScoredDiscoverResult[];
  sourceMovies: string[];
}

/** Map a non-library TMDB result, honouring an explicit watchlist exclusion. */
function mapMerged(r: TmdbSearchResult, flags: FlagSets, onWatchlist: boolean): DiscoverResult {
  return {
    tmdbId: r.tmdbId,
    title: r.title,
    overview: r.overview,
    releaseDate: r.releaseDate,
    posterPath: r.posterPath,
    posterUrl: buildPosterUrl(r.posterPath, r.tmdbId, false),
    backdropPath: r.backdropPath,
    voteAverage: r.voteAverage,
    voteCount: r.voteCount,
    genreIds: r.genreIds,
    popularity: r.popularity,
    inLibrary: false,
    isWatched: flags.watchedIds.has(r.tmdbId),
    onWatchlist,
  };
}

/** Recommendations from the top-`sampleSize` library movies, popularity-sorted. */
export async function getRecommendations(
  deps: DiscoveryDeps,
  sampleSize: number
): Promise<RecommendationsResult> {
  const topMovies = discoveryService.getTopRatedSourceMovies(deps.db, sampleSize);
  if (topMovies.length === 0) return { results: [], sourceMovies: [] };

  const flags = loadFlagSets(deps.db);
  const recResponses = await Promise.all(
    topMovies.map((m) => deps.tmdbClient.getMovieRecommendations(m.tmdbId, 1))
  );

  const seen = new Set<number>();
  const merged: DiscoverResult[] = [];
  for (const response of recResponses) {
    for (const result of response.results) {
      if (seen.has(result.tmdbId)) continue;
      if (flags.libraryIds.has(result.tmdbId)) continue;
      if (flags.dismissedIds.has(result.tmdbId)) continue;
      seen.add(result.tmdbId);
      merged.push(mapMerged(result, flags, flags.watchlistIds.has(result.tmdbId)));
    }
  }
  merged.sort((a, b) => b.popularity - a.popularity);
  return { results: merged, sourceMovies: topMovies.map((m) => m.title) };
}

/** Similar-to recommendations from recent watchlist movies, profile-scored. */
export async function getWatchlistRecommendations(
  deps: DiscoveryDeps
): Promise<WatchlistRecommendationsResult> {
  const watchlistItems = discoveryService.getRecentWatchlistSourceMovies(deps.db);
  if (watchlistItems.length === 0) return { results: [], sourceMovies: [] };

  const flags = loadFlagSets(deps.db);
  const simResponses = await Promise.all(
    watchlistItems.map((m) => deps.tmdbClient.getMovieSimilar(m.tmdbId, 1))
  );

  const seen = new Set<number>();
  const merged: DiscoverResult[] = [];
  for (const response of simResponses) {
    for (const result of response.results) {
      if (
        seen.has(result.tmdbId) ||
        flags.libraryIds.has(result.tmdbId) ||
        flags.watchlistIds.has(result.tmdbId) ||
        flags.dismissedIds.has(result.tmdbId)
      ) {
        continue;
      }
      seen.add(result.tmdbId);
      merged.push(mapMerged(result, flags, false));
    }
  }

  const profile = discoveryService.getPreferenceProfile(deps.db);
  return {
    results: discoveryService.scoreDiscoverResults(merged, profile),
    sourceMovies: watchlistItems.map((m) => m.title),
  };
}
