/**
 * Staleness service — mark, get, and reset staleness for media items.
 *
 * Staleness models how "stale" a comparison score is relative to the user's
 * current preferences. Each mark compounds by ×0.5 (floor 0.01). Watching
 * the media resets staleness to 1.0 (fresh).
 *
 * Reads + writes route through `getMediaDrizzle()` — `comparison_staleness`
 * is a media-only side effect of the watch/rating loop. The reset helper
 * accepts an optional drizzle handle so callers running inside a
 * `getMediaDrizzle().transaction(...)` can reuse the same tx (logWatch +
 * batchLogWatch).
 */
import { and, eq, sql } from 'drizzle-orm';

import { comparisonStaleness } from '@pops/media-db';

import { getMediaDrizzle } from '../../../db/media-db-handle.js';

import type { MediaDb } from '@pops/media-db';

const STALENESS_DECAY = 0.5;
const STALENESS_FLOOR = 0.01;

/**
 * Mark a media item as stale. Inserts with staleness = 0.5 if no row exists,
 * or multiplies existing staleness by 0.5 (floor 0.01).
 */
export function markStale(mediaType: string, mediaId: number): number {
  const db = getMediaDrizzle();

  const existing = db
    .select({ staleness: comparisonStaleness.staleness })
    .from(comparisonStaleness)
    .where(
      and(eq(comparisonStaleness.mediaType, mediaType), eq(comparisonStaleness.mediaId, mediaId))
    )
    .get();

  if (!existing) {
    db.insert(comparisonStaleness).values({ mediaType, mediaId, staleness: STALENESS_DECAY }).run();
    return STALENESS_DECAY;
  }

  const newStaleness = Math.max(existing.staleness * STALENESS_DECAY, STALENESS_FLOOR);

  db.update(comparisonStaleness)
    .set({ staleness: newStaleness, updatedAt: sql`(datetime('now'))` })
    .where(
      and(eq(comparisonStaleness.mediaType, mediaType), eq(comparisonStaleness.mediaId, mediaId))
    )
    .run();

  return newStaleness;
}

/**
 * Get the staleness value for a media item. Returns 1.0 (fresh) if no row.
 */
export function getStaleness(mediaType: string, mediaId: number): number {
  const db = getMediaDrizzle();

  const row = db
    .select({ staleness: comparisonStaleness.staleness })
    .from(comparisonStaleness)
    .where(
      and(eq(comparisonStaleness.mediaType, mediaType), eq(comparisonStaleness.mediaId, mediaId))
    )
    .get();

  return row?.staleness ?? 1.0;
}

/**
 * Reset staleness for a media item (delete the row so it defaults to 1.0).
 * Accepts an optional drizzle-compatible handle so writers inside a
 * `getMediaDrizzle().transaction(...)` (logWatch, batchLogWatch) can run
 * the delete on the same tx.
 */
export function resetStaleness(
  mediaType: string,
  mediaId: number,
  drizzleInstance?: MediaDb
): void {
  const db = drizzleInstance ?? getMediaDrizzle();

  db.delete(comparisonStaleness)
    .where(
      and(eq(comparisonStaleness.mediaType, mediaType), eq(comparisonStaleness.mediaId, mediaId))
    )
    .run();
}
