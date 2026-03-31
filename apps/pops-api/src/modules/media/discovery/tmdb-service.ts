/**
 * Discovery TMDB service — trending movies and recommendations from TMDB,
 * enriched with library membership status.
 */
import { desc, eq, isNotNull } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { movies, mediaWatchlist } from "@pops/db-types";
import type { TmdbClient } from "../tmdb/client.js";
import type { TmdbSearchResult } from "../tmdb/types.js";
import type { DiscoverResult, ScoredDiscoverResult } from "./types.js";
import { getPreferenceProfile, scoreDiscoverResults } from "./service.js";

/** Get all TMDB IDs currently in the library for quick lookup. */
function getLibraryTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
  return new Set(rows.map((r) => r.tmdbId));
}

/** Get dismissed TMDB IDs for filtering. Returns empty set if table doesn't exist yet. */
function getDismissedTmdbIds(): Set<number> {
  try {
    const db = getDrizzle();
    const rows = db.all<{ tmdb_id: number }>(/* sql */ `SELECT tmdb_id FROM dismissed_discover`);
    return new Set(rows.map((r) => r.tmdb_id));
  } catch {
    // Table may not exist yet (created by tb-115)
    return new Set();
  }
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

/** Map TMDB search results to discover results with library status. */
function toDiscoverResults(results: TmdbSearchResult[], libraryIds: Set<number>): DiscoverResult[] {
  return results.map((r) => {
    const inLibrary = libraryIds.has(r.tmdbId);
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
    };
  });
}

/** Fetch trending movies from TMDB. */
export async function getTrending(
  client: TmdbClient,
  timeWindow: "day" | "week",
  page: number
): Promise<{ results: DiscoverResult[]; totalResults: number; page: number }> {
  const [response, libraryIds] = await Promise.all([
    client.getTrendingMovies(timeWindow, page),
    Promise.resolve(getLibraryTmdbIds()),
  ]);

  const dismissedIds = getDismissedTmdbIds();
  const results = toDiscoverResults(response.results, libraryIds).filter(
    (r) => !dismissedIds.has(r.tmdbId)
  );

  return {
    results,
    totalResults: response.totalResults,
    page: response.page,
  };
}

/** Get top-rated library movies by voteAverage, then fetch recommendations for each. */
export async function getRecommendations(
  client: TmdbClient,
  sampleSize: number
): Promise<{ results: DiscoverResult[]; sourceMovies: string[] }> {
  const db = getDrizzle();

  // Get top-rated movies from library (by TMDB vote average)
  const topMovies = db
    .select({ tmdbId: movies.tmdbId, title: movies.title })
    .from(movies)
    .where(isNotNull(movies.voteAverage))
    .orderBy(desc(movies.voteAverage))
    .limit(sampleSize)
    .all();

  if (topMovies.length === 0) {
    return { results: [], sourceMovies: [] };
  }

  const libraryIds = getLibraryTmdbIds();
  const dismissedIds = getDismissedTmdbIds();

  // Fetch recommendations for each top movie in parallel
  const recPromises = topMovies.map((m) => client.getMovieRecommendations(m.tmdbId, 1));
  const recResponses = await Promise.all(recPromises);

  // Merge, deduplicate, and exclude library + dismissed movies
  const seen = new Set<number>();
  const merged: DiscoverResult[] = [];

  for (const response of recResponses) {
    for (const result of response.results) {
      if (seen.has(result.tmdbId)) continue;
      if (libraryIds.has(result.tmdbId)) continue;
      if (dismissedIds.has(result.tmdbId)) continue;
      seen.add(result.tmdbId);
      merged.push({
        tmdbId: result.tmdbId,
        title: result.title,
        overview: result.overview,
        releaseDate: result.releaseDate,
        posterPath: result.posterPath,
        posterUrl: buildPosterUrl(result.posterPath, result.tmdbId, false),
        backdropPath: result.backdropPath,
        voteAverage: result.voteAverage,
        voteCount: result.voteCount,
        genreIds: result.genreIds,
        popularity: result.popularity,
        inLibrary: false,
      });
    }
  }

  // Sort by popularity descending
  merged.sort((a, b) => b.popularity - a.popularity);

  return {
    results: merged,
    sourceMovies: topMovies.map((m) => m.title),
  };
}

/** Get TMDB IDs of movies on the watchlist for exclusion. */
function getWatchlistTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(mediaWatchlist)
    .innerJoin(movies, eq(movies.id, mediaWatchlist.mediaId))
    .where(eq(mediaWatchlist.mediaType, "movie"))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}

/**
 * Get recommendations based on watchlist movies.
 * Fetches TMDB /movie/{id}/similar for the 10 most recent watchlist items,
 * merges/deduplicates, excludes library + watchlist + dismissed, scores by preference profile.
 */
export async function getWatchlistRecommendations(
  client: TmdbClient
): Promise<{ results: ScoredDiscoverResult[]; sourceMovies: string[] }> {
  const db = getDrizzle();

  // Get up to 10 most recently added movie watchlist items
  const watchlistItems = db
    .select({ tmdbId: movies.tmdbId, title: movies.title })
    .from(mediaWatchlist)
    .innerJoin(movies, eq(movies.id, mediaWatchlist.mediaId))
    .where(eq(mediaWatchlist.mediaType, "movie"))
    .orderBy(desc(mediaWatchlist.addedAt))
    .limit(10)
    .all();

  if (watchlistItems.length === 0) {
    return { results: [], sourceMovies: [] };
  }

  const libraryIds = getLibraryTmdbIds();
  const watchlistIds = getWatchlistTmdbIds();
  const dismissedIds = getDismissedTmdbIds();

  // Fetch similar movies for each watchlist item in parallel
  const simPromises = watchlistItems.map((m) => client.getMovieSimilar(m.tmdbId, 1));
  const simResponses = await Promise.all(simPromises);

  // Merge and deduplicate, excluding library, watchlist, and dismissed
  const seen = new Set<number>();
  const merged: DiscoverResult[] = [];

  for (const response of simResponses) {
    for (const result of response.results) {
      if (
        seen.has(result.tmdbId) ||
        libraryIds.has(result.tmdbId) ||
        watchlistIds.has(result.tmdbId) ||
        dismissedIds.has(result.tmdbId)
      ) {
        continue;
      }
      seen.add(result.tmdbId);
      merged.push({
        tmdbId: result.tmdbId,
        title: result.title,
        overview: result.overview,
        releaseDate: result.releaseDate,
        posterPath: result.posterPath,
        posterUrl: buildPosterUrl(result.posterPath, result.tmdbId, false),
        backdropPath: result.backdropPath,
        voteAverage: result.voteAverage,
        voteCount: result.voteCount,
        genreIds: result.genreIds,
        popularity: result.popularity,
        inLibrary: false,
      });
    }
  }

  // Score using preference profile
  const profile = getPreferenceProfile();
  const scored = scoreDiscoverResults(merged, profile);

  return {
    results: scored,
    sourceMovies: watchlistItems.map((m) => m.title),
  };
}
