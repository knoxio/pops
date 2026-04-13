/**
 * Leaving lifecycle service — cancel leaving status on movies.
 *
 * PRD-070 US-03
 */
import { movies } from '@pops/db-types';
import { eq } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';

/**
 * Clear leaving/protected rotation status for a specific movie.
 * Returns true if the movie existed and was updated, false otherwise.
 */
export function cancelLeaving(movieId: number): boolean {
  const db = getDrizzle();
  const movie = db
    .select({ id: movies.id, rotationStatus: movies.rotationStatus })
    .from(movies)
    .where(eq(movies.id, movieId))
    .get();

  if (!movie) return false;
  if (movie.rotationStatus !== 'leaving') return false;

  db.update(movies)
    .set({
      rotationStatus: null,
      rotationExpiresAt: null,
      rotationMarkedAt: null,
    })
    .where(eq(movies.id, movieId))
    .run();

  return true;
}

/**
 * Side-effect for watchlist add: if the movie being added has
 * rotation_status = 'leaving', clear it.
 *
 * Called from the watchlist router after a successful watchlist insert.
 * Only operates on movies (not TV shows).
 */
export function clearLeavingOnWatchlistAdd(mediaType: string, mediaId: number): boolean {
  if (mediaType !== 'movie') return false;

  const db = getDrizzle();
  const movie = db
    .select({ id: movies.id, rotationStatus: movies.rotationStatus })
    .from(movies)
    .where(eq(movies.id, mediaId))
    .get();

  if (!movie || movie.rotationStatus !== 'leaving') return false;

  db.update(movies)
    .set({
      rotationStatus: null,
      rotationExpiresAt: null,
      rotationMarkedAt: null,
    })
    .where(eq(movies.id, mediaId))
    .run();

  return true;
}
