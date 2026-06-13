import { sql } from 'drizzle-orm';

import { movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { createMovie, getMovie, getMovieByTmdbId, updateMovie } from '../movies/service.js';
import { toMovie } from '../movies/types.js';

/**
 * Library service — orchestrates adding media to the local library
 * by fetching metadata from external APIs and inserting records.
 */
import type { MovieRow } from '@pops/db-types';

import type { Movie, UpdateMovieInput } from '../movies/types.js';
import type { TmdbClient } from '../tmdb/client.js';
import type { ImageCacheService } from '../tmdb/image-cache.js';
import type { TmdbMovieDetail } from '../tmdb/types.js';

export { listLibrary, listLibraryGenres } from './list-service.js';

/**
 * Add a movie to the library by TMDB ID.
 *
 * Idempotent: returns the existing record if the movie is already in the library.
 * Fetches full detail from TMDB, maps fields, inserts a new record,
 * and downloads poster/backdrop images to the local cache.
 */
export async function addMovie(
  tmdbId: number,
  tmdbClient: TmdbClient,
  imageCache: ImageCacheService
): Promise<{ movie: Movie; created: boolean }> {
  const existing = getMovieByTmdbId(tmdbId);
  if (existing) {
    return { movie: toMovie(existing), created: false };
  }

  const detail = await tmdbClient.getMovie(tmdbId);
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
    posterPath: detail.posterPath ? `/media/images/movie/${detail.tmdbId}/poster.jpg` : null,
    backdropPath: detail.backdropPath ? `/media/images/movie/${detail.tmdbId}/backdrop.jpg` : null,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
  });

  await imageCache.downloadMovieImages(detail.tmdbId, detail.posterPath, detail.backdropPath, null);
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
    posterPath: detail.posterPath ? `/media/images/movie/${detail.tmdbId}/poster.jpg` : null,
    backdropPath: detail.backdropPath ? `/media/images/movie/${detail.tmdbId}/backdrop.jpg` : null,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
  };
}

/**
 * Refresh movie metadata from TMDB.
 *
 * Fetches fresh detail from TMDB and updates the local record.
 * Preserves poster_override_path (user-uploaded override).
 * When redownloadImages is true, deletes and re-downloads cached images.
 */
export async function refreshMovie(
  id: number,
  tmdbClient: TmdbClient,
  imageCache: ImageCacheService,
  redownloadImages = false
): Promise<MovieRow> {
  const existing = getMovie(id);
  const detail = await tmdbClient.getMovie(existing.tmdbId);
  const updated = updateMovie(id, mapTmdbDetailToUpdate(detail));

  if (redownloadImages) {
    await imageCache.deleteMovieImages(existing.tmdbId);
    await imageCache.downloadMovieImages(
      existing.tmdbId,
      detail.posterPath,
      detail.backdropPath,
      null
    );
  }

  return updated;
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
