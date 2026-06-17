/**
 * Pure-db queries for the rotation removal phase + leaving lifecycle.
 *
 * HTTP-free; `(db, …)`-arg. Ported from the monolith `removal-selection.ts`
 * (the SQLite parts) + `leaving-lifecycle.ts`. The Radarr-touching pieces
 * (disk space, per-movie sizes, the download queue, the actual delete) live in
 * the api layer (`rotation-removal.ts`); this module only reads/writes the
 * `movies` + `watchlist` tables. The pillar's watchlist is local, so
 * watchlist exclusion joins the pillar `watchlist` table rather than the
 * monolith's shared `media_watchlist`.
 */
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { mediaWatchlist, movies } from '../../schema.js';

import type { MediaDb } from '../internal.js';

/** Map of TMDB id → size in GB, as measured from Radarr. */
export type MovieSizeMap = Map<number, number>;

export interface EligibleMovie {
  id: number;
  tmdbId: number;
  title: string;
  createdAt: string;
}

export interface LeavingMovie {
  id: number;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  rotationExpiresAt: string | null;
  rotationMarkedAt: string | null;
}

export interface ExpiredMovie {
  id: number;
  tmdbId: number;
  title: string;
}

/**
 * Movies eligible for removal, oldest first. Excludes watchlist items,
 * unexpired protected movies, currently-downloading movies, and movies with no
 * Radarr file (size 0 / absent). Already-`leaving` movies are filtered in SQL.
 */
export function getEligibleForRemoval(
  db: MediaDb,
  movieSizes: MovieSizeMap,
  downloadingTmdbIds: ReadonlySet<number>
): EligibleMovie[] {
  const now = new Date().toISOString();

  const watchlistRows = db
    .select({ mediaId: mediaWatchlist.mediaId })
    .from(mediaWatchlist)
    .where(eq(mediaWatchlist.mediaType, 'movie'))
    .all();
  const watchlistMovieIds = new Set(watchlistRows.map((r) => r.mediaId));

  const candidates = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      createdAt: movies.createdAt,
      rotationStatus: movies.rotationStatus,
      rotationExpiresAt: movies.rotationExpiresAt,
    })
    .from(movies)
    .where(ne(sql`coalesce(${movies.rotationStatus}, '')`, sql`'leaving'`))
    .orderBy(asc(movies.createdAt))
    .all();

  return candidates.filter((m) => {
    if (watchlistMovieIds.has(m.id)) return false;
    if (m.rotationStatus === 'protected' && m.rotationExpiresAt && m.rotationExpiresAt > now) {
      return false;
    }
    if (downloadingTmdbIds.has(m.tmdbId)) return false;
    const sizeGb = movieSizes.get(m.tmdbId);
    if (sizeGb === undefined || sizeGb <= 0) return false;
    return true;
  });
}

/** Total size in GB of movies currently in the `leaving` state. */
export function getLeavingMovieSizeGb(db: MediaDb, movieSizes: MovieSizeMap): number {
  const leaving = db
    .select({ tmdbId: movies.tmdbId })
    .from(movies)
    .where(eq(movies.rotationStatus, 'leaving'))
    .all();
  let total = 0;
  for (const m of leaving) total += movieSizes.get(m.tmdbId) ?? 0;
  return total;
}

/** Mark the given movie ids as `leaving` with the supplied expiry timestamp. */
export function markMoviesAsLeaving(db: MediaDb, movieIds: number[], expiresAt: string): void {
  if (movieIds.length === 0) return;
  db.update(movies)
    .set({
      rotationStatus: 'leaving',
      rotationExpiresAt: expiresAt,
      rotationMarkedAt: new Date().toISOString(),
    })
    .where(inArray(movies.id, movieIds))
    .run();
}

/** `leaving` movies whose `rotation_expires_at` is in the past. */
export function getExpiredLeavingMovies(db: MediaDb): ExpiredMovie[] {
  const now = new Date().toISOString();
  return db
    .select({ id: movies.id, tmdbId: movies.tmdbId, title: movies.title })
    .from(movies)
    .where(and(eq(movies.rotationStatus, 'leaving'), sql`${movies.rotationExpiresAt} <= ${now}`))
    .all();
}

/** `leaving` movies sorted by expiry (soonest first) for the UI. */
export function getLeavingMovies(db: MediaDb): LeavingMovie[] {
  return db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      posterPath: movies.posterPath,
      rotationExpiresAt: movies.rotationExpiresAt,
      rotationMarkedAt: movies.rotationMarkedAt,
    })
    .from(movies)
    .where(eq(movies.rotationStatus, 'leaving'))
    .orderBy(asc(movies.rotationExpiresAt))
    .all();
}

/** Clear all rotation fields on a movie by id (post-removal / cancel). */
export function clearRotationStatus(db: MediaDb, id: number): void {
  db.update(movies)
    .set({ rotationStatus: null, rotationExpiresAt: null, rotationMarkedAt: null })
    .where(eq(movies.id, id))
    .run();
}

/**
 * Clear `leaving` status for a movie. Returns `true` when the movie existed and
 * was actually in the `leaving` state, `false` otherwise.
 */
export function cancelLeaving(db: MediaDb, movieId: number): boolean {
  const movie = db
    .select({ id: movies.id, rotationStatus: movies.rotationStatus })
    .from(movies)
    .where(eq(movies.id, movieId))
    .get();
  if (!movie || movie.rotationStatus !== 'leaving') return false;
  clearRotationStatus(db, movieId);
  return true;
}
