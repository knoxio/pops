/**
 * Context-aware picks — fetches TMDB discover results for the currently-active
 * context collections (time of day / month / day of week).
 *
 * Ported from the monolith `context-picks-service.ts`.
 */
import { getActiveCollections, type ContextCollection } from './context-collections.js';
import { loadFlagSets, type DiscoveryDeps } from './deps.js';
import { buildPosterUrl, type FlagSets } from './discover-result-mapper.js';

import type { DiscoverResult } from '../../../db/index.js';

export interface ContextPicksCollection {
  id: string;
  title: string;
  emoji: string;
  results: DiscoverResult[];
}

export interface ContextPicksResponse {
  collections: ContextPicksCollection[];
}

interface FetchArgs {
  deps: DiscoveryDeps;
  collection: ContextCollection;
  flags: FlagSets;
  page: number;
}

async function fetchCollectionResults(args: FetchArgs): Promise<DiscoverResult[]> {
  const { deps, collection, flags, page } = args;
  const response = await deps.tmdbClient.discoverMovies({
    genreIds: collection.genreIds.length > 0 ? collection.genreIds : undefined,
    keywordIds: collection.keywordIds.length > 0 ? collection.keywordIds : undefined,
    sortBy: 'vote_average.desc',
    voteCountGte: 100,
    page,
  });

  return response.results
    .filter((r) => !flags.libraryIds.has(r.tmdbId) && !flags.dismissedIds.has(r.tmdbId))
    .map((r) => ({
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
      onWatchlist: flags.watchlistIds.has(r.tmdbId),
    }));
}

/**
 * Context picks for the current moment.
 *
 * @param pages optional map of `collectionId → page` for Load More.
 */
export async function getContextPicks(
  deps: DiscoveryDeps,
  pages?: Record<string, number>
): Promise<ContextPicksResponse> {
  const now = new Date();
  const activeCollections = getActiveCollections(now.getHours(), now.getMonth() + 1, now.getDay());
  const flags = loadFlagSets(deps.db);

  const collections = await Promise.all(
    activeCollections.map(async (col) => ({
      id: col.id,
      title: col.title,
      emoji: col.emoji,
      results: await fetchCollectionResults({
        deps,
        collection: col,
        flags,
        page: pages?.[col.id] ?? 1,
      }),
    }))
  );
  return { collections };
}
