/**
 * Comparison-staleness — mark, read, and reset how "stale" a media item's
 * scores are relative to the user's current preferences. HTTP-free, `(db, …)`
 * arg.
 *
 * Each `markStale` compounds the value by ×0.5 (floor 0.01); a fresh item
 * defaults to 1.0. `resetStaleness` deletes the row so it returns to fresh —
 * exported for the watch-history log/batchLog paths to call when a movie is
 * (re)watched (wired up by a later follow-up).
 */
import { and, eq, type SQL, sql } from 'drizzle-orm';

import { comparisonStaleness } from '../../schema.js';

import type { MediaDb } from '../internal.js';

const STALENESS_DECAY = 0.5;
const STALENESS_FLOOR = 0.01;

function mediaWhere(mediaType: string, mediaId: number): SQL | undefined {
  return and(
    eq(comparisonStaleness.mediaType, mediaType),
    eq(comparisonStaleness.mediaId, mediaId)
  );
}

/** Mark a media item stale: insert at 0.5, or multiply existing by 0.5 (floor 0.01). */
export function markStale(db: MediaDb, mediaType: string, mediaId: number): number {
  const existing = db
    .select({ staleness: comparisonStaleness.staleness })
    .from(comparisonStaleness)
    .where(mediaWhere(mediaType, mediaId))
    .get();

  if (!existing) {
    db.insert(comparisonStaleness).values({ mediaType, mediaId, staleness: STALENESS_DECAY }).run();
    return STALENESS_DECAY;
  }

  const newStaleness = Math.max(existing.staleness * STALENESS_DECAY, STALENESS_FLOOR);
  db.update(comparisonStaleness)
    .set({ staleness: newStaleness, updatedAt: sql`(datetime('now'))` })
    .where(mediaWhere(mediaType, mediaId))
    .run();

  return newStaleness;
}

/** Staleness for a media item. Returns 1.0 (fresh) when no row exists. */
export function getStaleness(db: MediaDb, mediaType: string, mediaId: number): number {
  const row = db
    .select({ staleness: comparisonStaleness.staleness })
    .from(comparisonStaleness)
    .where(mediaWhere(mediaType, mediaId))
    .get();
  return row?.staleness ?? 1.0;
}

/**
 * Reset staleness for a media item (delete the row → defaults back to 1.0).
 * Watching/rating a movie resets it to fresh; the watch-history log path will
 * call this once wired up.
 */
export function resetStaleness(db: MediaDb, mediaType: string, mediaId: number): void {
  db.delete(comparisonStaleness).where(mediaWhere(mediaType, mediaId)).run();
}
