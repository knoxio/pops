/**
 * Discovery TMDB service — trending movies and recommendations from TMDB,
 * enriched with library membership status.
 */
import { desc, isNotNull } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { movies } from "@pops/db-types";
import type { TmdbClient } from "../tmdb/client.js";
import type { TmdbSearchResult } from "../tmdb/types.js";
import type { DiscoverResult } from "./types.js";

/** Get all TMDB IDs currently in the library for quick lookup. */
function getLibraryTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
  return new Set(rows.map((r) => r.tmdbId));
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

  return {
    results: toDiscoverResults(response.results, libraryIds),
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

  // Fetch recommendations for each top movie in parallel
  const recPromises = topMovies.map((m) => client.getMovieRecommendations(m.tmdbId, 1));
  const recResponses = await Promise.all(recPromises);

  // Merge and deduplicate
  const seen = new Set<number>();
  const merged: DiscoverResult[] = [];

  for (const response of recResponses) {
    for (const result of response.results) {
      if (!seen.has(result.tmdbId)) {
        seen.add(result.tmdbId);
        const inLibrary = libraryIds.has(result.tmdbId);
        merged.push({
          tmdbId: result.tmdbId,
          title: result.title,
          overview: result.overview,
          releaseDate: result.releaseDate,
          posterPath: result.posterPath,
          posterUrl: buildPosterUrl(result.posterPath, result.tmdbId, inLibrary),
          backdropPath: result.backdropPath,
          voteAverage: result.voteAverage,
          voteCount: result.voteCount,
          genreIds: result.genreIds,
          popularity: result.popularity,
          inLibrary,
        });
      }
    }
  }

  // Sort by popularity descending
  merged.sort((a, b) => b.popularity - a.popularity);

  return {
    results: merged,
    sourceMovies: topMovies.map((m) => m.title),
  };
}
