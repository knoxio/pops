/**
 * Library add/refresh use-case services for the media pillar REST surface.
 *
 * These orchestrate the upstream metadata clients (TMDB / TheTVDB) and the
 * pillar db services — an api-layer concern, NOT a db service: the `src/db`
 * layer stays HTTP-free.
 *
 * `addMovie` deliberately does NOT fire a Plex Discover watch-status check.
 */
import {
  type CreateMovieInput,
  type MediaDb,
  type MovieRow,
  type UpdateMovieInput,
  moviesService,
} from '../../db/index.js';

import type { ImageCacheService } from '../clients/tmdb/image-cache.js';
import type { TmdbClient } from '../clients/tmdb/index.js';
import type { TmdbMovieDetail } from '../clients/tmdb/types.js';

/** Outcome of {@link addMovie} — the persisted row plus whether it was created. */
export interface AddMovieResult {
  movie: MovieRow;
  created: boolean;
}

/** Collaborators the movie mutations orchestrate: the db handle + upstream clients. */
export interface MovieMutationDeps {
  db: MediaDb;
  tmdbClient: TmdbClient;
  imageCache: ImageCacheService;
}

function movieImagePath(tmdbId: number, path: string | null, kind: string): string | null {
  return path ? `/media/images/movie/${tmdbId}/${kind}` : null;
}

function detailToCreateInput(detail: TmdbMovieDetail): CreateMovieInput {
  return {
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
    posterPath: movieImagePath(detail.tmdbId, detail.posterPath, 'poster.jpg'),
    backdropPath: movieImagePath(detail.tmdbId, detail.backdropPath, 'backdrop.jpg'),
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
  };
}

/** Map a TMDB detail to an update input. Omits `posterOverridePath` so the
 *  user-uploaded override the db layer holds is preserved across refreshes. */
function detailToUpdateInput(detail: TmdbMovieDetail): UpdateMovieInput {
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
    posterPath: movieImagePath(detail.tmdbId, detail.posterPath, 'poster.jpg'),
    backdropPath: movieImagePath(detail.tmdbId, detail.backdropPath, 'backdrop.jpg'),
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
  };
}

/**
 * Add a movie to the library by TMDB ID.
 *
 * Idempotent: returns the existing record (`created: false`) if the movie is
 * already in the library. Otherwise fetches full detail from TMDB, inserts a
 * record, and downloads poster/backdrop images to the local cache.
 */
export async function addMovie(deps: MovieMutationDeps, tmdbId: number): Promise<AddMovieResult> {
  const { db, tmdbClient, imageCache } = deps;
  const existing = moviesService.getMovieByTmdbId(db, tmdbId);
  if (existing) return { movie: existing, created: false };

  const detail = await tmdbClient.getMovie(tmdbId);
  const row = moviesService.createMovie(db, detailToCreateInput(detail));

  await imageCache.downloadMovieImages(detail.tmdbId, detail.posterPath, detail.backdropPath, null);
  return { movie: row, created: true };
}

/**
 * Refresh movie metadata from TMDB.
 *
 * Fetches fresh detail and updates the local record (the db layer preserves
 * the user-uploaded poster override). When `redownloadImages` is true, the
 * cached images are deleted and re-downloaded.
 */
export async function refreshMovie(
  deps: MovieMutationDeps,
  id: number,
  redownloadImages = false
): Promise<MovieRow> {
  const { db, tmdbClient, imageCache } = deps;
  const existing = moviesService.getMovie(db, id);
  const detail = await tmdbClient.getMovie(existing.tmdbId);
  const updated = moviesService.updateMovie(db, id, detailToUpdateInput(detail));

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
