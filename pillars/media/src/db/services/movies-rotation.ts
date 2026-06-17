/**
 * Rotation-status writes against the movies table. Kept separate from
 * `movies.ts` so that file stays within the per-file line cap.
 */
import { eq } from 'drizzle-orm';

import { movies } from '../schema.js';
import { getMovie, type MovieRow } from './movies.js';

import type { MediaDb } from './internal.js';

/** Rotation status a movie can carry. Mirrors the `movies.rotationStatus` enum. */
export type RotationStatus = NonNullable<MovieRow['rotationStatus']>;

/**
 * Set (or clear) a movie's rotation status by id. HTTP-free; used by the arr
 * `downloadAndProtect` flow to mark a freshly-added movie as `protected`.
 * Throws `MovieNotFoundError` if the movie is missing.
 */
export function setRotationStatus(
  db: MediaDb,
  id: number,
  status: RotationStatus | null
): MovieRow {
  getMovie(db, id);
  db.update(movies)
    .set({ rotationStatus: status, rotationMarkedAt: new Date().toISOString() })
    .where(eq(movies.id, id))
    .run();
  return getMovie(db, id);
}
