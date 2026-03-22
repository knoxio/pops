/**
 * Library service — orchestrates adding media to the local library
 * by fetching metadata from external APIs and inserting records.
 */
import { sql } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { movies, watchHistory } from "@pops/db-types";
import type { TmdbClient } from "../tmdb/client.js";
import type { TmdbMovieDetail } from "../tmdb/types.js";
import { getMovieByTmdbId, getMovie, createMovie, updateMovie } from "../movies/service.js";
import { toMovie } from "../movies/types.js";
import type { Movie, UpdateMovieInput } from "../movies/types.js";
import type { MovieRow } from "@pops/db-types";

/**
 * Add a movie to the library by TMDB ID.
 *
 * Idempotent: returns the existing record if the movie is already in the library.
 * Fetches full detail from TMDB, maps fields, and inserts a new record.
 *
 * Image download is deferred until the image cache service is available (tb-058).
 */
export async function addMovie(
  tmdbId: number,
  tmdbClient: TmdbClient
): Promise<{ movie: Movie; created: boolean }> {
  // Idempotency: return existing if already in library
  const existing = getMovieByTmdbId(tmdbId);
  if (existing) {
    return { movie: toMovie(existing), created: false };
  }

  // Fetch full detail from TMDB
  const detail = await tmdbClient.getMovie(tmdbId);

  // Map TMDB detail to our CreateMovieInput
  const row = createMovie({
    tmdbId: detail.tmdbId,
    imdbId: detail.imdbId,
    title: detail.title,
    originalTitle: detail.originalTitle,
    overview: detail.overview,
    tagline: detail.tagline,
    releaseDate: detail.releaseDate,
    runtime: detail.runtime,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    budget: detail.budget,
    revenue: detail.revenue,
    posterPath: detail.posterPath,
    backdropPath: detail.backdropPath,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
  });

  // TODO: download images in background when image cache service is available (tb-058)

  return { movie: toMovie(row), created: true };
}

/** Map a TMDB movie detail response to an update input, preserving poster_override_path. */
function mapTmdbDetailToUpdate(detail: TmdbMovieDetail): UpdateMovieInput {
  return {
    imdbId: detail.imdbId,
    title: detail.title,
    originalTitle: detail.originalTitle,
    overview: detail.overview,
    tagline: detail.tagline,
    releaseDate: detail.releaseDate,
    runtime: detail.runtime,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    budget: detail.budget,
    revenue: detail.revenue,
    posterPath: detail.posterPath,
    backdropPath: detail.backdropPath,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
    // NOTE: posterOverridePath is intentionally omitted to preserve user overrides
  };
}

/**
 * Refresh movie metadata from TMDB.
 *
 * Fetches fresh detail from TMDB and updates the local record.
 * Preserves poster_override_path (user-uploaded override).
 */
export async function refreshMovie(id: number, tmdbClient: TmdbClient): Promise<MovieRow> {
  // Get existing movie (throws NotFoundError if missing)
  const existing = getMovie(id);

  // Fetch fresh detail from TMDB
  const detail = await tmdbClient.getMovie(existing.tmdbId);

  // Map TMDB detail to update input (preserves poster_override_path)
  const updateInput = mapTmdbDetailToUpdate(detail);

  // Update the local record
  return updateMovie(id, updateInput);
}

/**
 * Get random unwatched movies from the library.
 *
 * Returns movies that have no completed watch_history entries.
 * Uses SQLite's RANDOM() for ordering.
 */
export function getQuickPicks(count: number): Movie[] {
  const db = getDrizzle();

  const rows = db
    .select()
    .from(movies)
    .where(
      sql`${movies.id} NOT IN (
        SELECT DISTINCT ${watchHistory.mediaId}
        FROM ${watchHistory}
        WHERE ${watchHistory.mediaType} = 'movie'
          AND ${watchHistory.completed} = 1
      )`
    )
    .orderBy(sql`RANDOM()`)
    .limit(count)
    .all();

  return rows.map(toMovie);
}
