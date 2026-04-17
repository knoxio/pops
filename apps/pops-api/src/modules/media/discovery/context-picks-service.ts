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

/** Fetch discover results for a single context collection. */
async function fetchCollectionResults(
  client: TmdbClient,
  collection: ContextCollection,
  libraryIds: Set<number>,
  dismissedIds: Set<number>,
  watchedIds: Set<number>,
  watchlistIds: Set<number>,
  page: number
): Promise<DiscoverResult[]> {
  const response = await client.discoverMovies({
    genreIds: collection.genreIds.length > 0 ? collection.genreIds : undefined,
    keywordIds: collection.keywordIds.length > 0 ? collection.keywordIds : undefined,
    sortBy: 'vote_average.desc',
    voteCountGte: 100,
    page,
  });

  return response.results
    .filter((r) => !libraryIds.has(r.tmdbId) && !dismissedIds.has(r.tmdbId))
    .map((r) => {
      const inLibrary = false; // Already filtered out library movies
      return {
        tmdbId: r.tmdbId,
        title: r.title,
        overview: r.overview,
        releaseDate: r.releaseDate,
        posterPath: r.posterPath,
        posterUrl: buildPosterUrl(r.posterPath, r.tmdbId, inLibrary),
        backdropPath: r.backdropPath,
        voteAverage: r.voteAverage,
        voteCount: r.voteCount,
        genreIds: r.genreIds,
        popularity: r.popularity,
        inLibrary,
        isWatched: watchedIds.has(r.tmdbId),
        onWatchlist: watchlistIds.has(r.tmdbId),
      };
    });
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
  const libraryIds = getLibraryTmdbIds();
  const dismissedIds = getDismissedTmdbIds();
  const watchedIds = getWatchedTmdbIds();
  const watchlistIds = getWatchlistTmdbIds();

  const collectionResults = await Promise.all(
    activeCollections.map(async (col) => {
      const page = pages?.[col.id] ?? 1;
      const results = await fetchCollectionResults(
        client,
        col,
        libraryIds,
        dismissedIds,
        watchedIds,
        watchlistIds,
        page
      );
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
