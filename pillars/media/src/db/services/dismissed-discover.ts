/**
 * Discovery dismiss-pile CRUD against the media pillar's SQLite via drizzle.
 *
 * The `dismissed_discover` table records TMDB ids the user has dismissed
 * from the discover surface so subsequent discovery passes can filter them
 * out. Each row is uniquely keyed by `tmdb_id` and stamped with a
 * `dismissed_at` timestamp via the SQLite table default.
 */
import { eq } from 'drizzle-orm';

import { dismissedDiscover } from '../schema.js';

import type { MediaDb } from './internal.js';

/** Raw drizzle row shape — the persisted dismissed_discover record. */
export type DismissedDiscoverRow = typeof dismissedDiscover.$inferSelect;

/**
 * Insert a dismissal for `tmdbId`. Idempotent — a second call with the
 * same id is a no-op (ON CONFLICT DO NOTHING).
 */
export function dismiss(db: MediaDb, tmdbId: number): void {
  db.insert(dismissedDiscover).values({ tmdbId }).onConflictDoNothing().run();
}

/**
 * Remove a dismissal for `tmdbId`. Idempotent — deleting an absent row is
 * a no-op.
 */
export function undismiss(db: MediaDb, tmdbId: number): void {
  db.delete(dismissedDiscover).where(eq(dismissedDiscover.tmdbId, tmdbId)).run();
}

/** Return every dismissed TMDB id as a plain number array. */
export function listDismissedTmdbIds(db: MediaDb): number[] {
  const rows = db.select({ tmdbId: dismissedDiscover.tmdbId }).from(dismissedDiscover).all();
  return rows.map((r) => r.tmdbId);
}

/**
 * Return every dismissed TMDB id as a Set for O(1) membership checks. Used
 * by the discovery filtering pipeline to drop dismissed items from
 * candidate result lists.
 */
export function getDismissedTmdbIdSet(db: MediaDb): Set<number> {
  return new Set(listDismissedTmdbIds(db));
}

/** Return every persisted row (full record, not just the id). */
export function listDismissed(db: MediaDb): DismissedDiscoverRow[] {
  return db.select().from(dismissedDiscover).all();
}
