/**
 * Library service — orchestrates adding media to the local library
 * by fetching metadata from external APIs and inserting records.
 */
import type { TmdbClient } from "../tmdb/client.js";
import type { MovieRow } from "@pops/db-types";
import { getMovieByTmdbId, createMovie } from "../movies/service.js";
import { toMovie } from "../movies/types.js";
import type { Movie } from "../movies/types.js";

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
  tmdbClient: TmdbClient,
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
