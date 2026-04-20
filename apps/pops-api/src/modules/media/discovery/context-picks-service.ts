/**
 * Context-aware picks service — fetches TMDB discover results
 * for the currently active context collections.
 */
import { movies } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { type ContextCollection, getActiveCollections } from './context-collections.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from './flags.js';

import type { TmdbClient } from '../tmdb/client.js';
import type { DiscoverResult } from './types.js';

/** A context collection result set for the API response. */
export interface ContextPicksCollection {
  id: string;
  title: string;
  emoji: string;
  results: DiscoverResult[];
}

/** Full response shape for the contextPicks endpoint. */
export interface ContextPicksResponse {
  collections: ContextPicksCollection[];
}

/** Build a poster URL: proxy for library items, TMDB CDN for non-library items. */
function buildPosterUrl(
  posterPath: string | null,
  tmdbId: number,
  inLibrary: boolean
): string | null {
  if (!posterPath) return null;
  if (inLibrary) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return `https://image.tmdb.org/t/p/w342${posterPath}`;
}

/** Get all TMDB IDs currently in the library for quick lookup. */
function getLibraryTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
  return new Set(rows.map((r) => r.tmdbId));
}

interface FlagSets {
  libraryIds: Set<number>;
  dismissedIds: Set<number>;
  watchedIds: Set<number>;
  watchlistIds: Set<number>;
}

interface FetchCollectionArgs {
  client: TmdbClient;
  collection: ContextCollection;
  flags: FlagSets;
  page: number;
}

/** Fetch discover results for a single context collection. */
async function fetchCollectionResults(args: FetchCollectionArgs): Promise<DiscoverResult[]> {
  const { client, collection, flags, page } = args;
  const response = await client.discoverMovies({
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
 * Get context-aware movie picks based on current time.
 *
 * @param pages — optional map of collectionId → page number for Load More
 */
export async function getContextPicks(
  client: TmdbClient,
  pages?: Record<string, number>
): Promise<ContextPicksResponse> {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth() + 1; // JS months are 0-indexed
  const dayOfWeek = now.getDay();

  const activeCollections = getActiveCollections(hour, month, dayOfWeek);
  const flags: FlagSets = {
    libraryIds: getLibraryTmdbIds(),
    dismissedIds: getDismissedTmdbIds(),
    watchedIds: getWatchedTmdbIds(),
    watchlistIds: getWatchlistTmdbIds(),
  };

  const collectionResults = await Promise.all(
    activeCollections.map(async (col) => {
      const page = pages?.[col.id] ?? 1;
      const results = await fetchCollectionResults({ client, collection: col, flags, page });
      return {
        id: col.id,
        title: col.title,
        emoji: col.emoji,
        results,
      };
    })
  );

  return { collections: collectionResults };
}
