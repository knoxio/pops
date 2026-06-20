/**
 * Shared Plex-sync primitives — external-ID extraction + movie watch logging.
 *
 * Ported from the monolith `media/plex/sync-helpers.ts` and converted to the
 * pillar's `(db, …)` arg-passing pattern. The near-duplicate window query
 * reads the `watch_history` table via the passed handle; the insert delegates
 * to `watchHistoryLogService.logWatch` (idempotent on the unique key).
 */
import { and, eq, gte, lte } from 'drizzle-orm';

import { type MediaDb, watchHistory, watchHistoryLogService } from '../../../../db/index.js';

import type { PlexMediaItem } from '../types.js';

/**
 * Extract an external ID (tmdb, tvdb, imdb) from a Plex item and parse it as
 * a number. Returns `null` if absent or non-numeric.
 */
export function extractExternalIdAsNumber(item: PlexMediaItem, source: string): number | null {
  const match = item.externalIds.find((id) => id.source === source);
  if (!match) return null;
  const parsed = Number(match.id);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Near-duplicate dedup window for Plex sync: 5 minutes in milliseconds. */
const NEAR_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Whether a watch event for the same media already exists within ±5 minutes
 * of `watchedAt`. Suppresses duplicates when local Plex sync and (future)
 * Discover cloud sync both process the same playback. Returns `true` when a
 * near-duplicate exists (caller should skip the insert).
 */
export function hasNearDuplicateWatch(
  db: MediaDb,
  mediaType: 'movie' | 'episode',
  mediaId: number,
  watchedAt: string
): boolean {
  try {
    const ts = new Date(watchedAt).getTime();
    const windowStart = new Date(ts - NEAR_DUPLICATE_WINDOW_MS).toISOString();
    const windowEnd = new Date(ts + NEAR_DUPLICATE_WINDOW_MS).toISOString();
    const existing = db
      .select({ id: watchHistory.id })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.mediaType, mediaType),
          eq(watchHistory.mediaId, mediaId),
          gte(watchHistory.watchedAt, windowStart),
          lte(watchHistory.watchedAt, windowEnd)
        )
      )
      .get();
    return existing != null;
  } catch {
    return false;
  }
}

/**
 * Log a movie watch event from Plex data. Skips exact + near-duplicate
 * entries (±5 min). Returns `true` when a new entry was created.
 */
export function logMovieWatch(
  db: MediaDb,
  movieId: number,
  lastViewedAtUnix: number | null
): boolean {
  const watchedAt = lastViewedAtUnix
    ? new Date(lastViewedAtUnix * 1000).toISOString()
    : new Date().toISOString();

  if (hasNearDuplicateWatch(db, 'movie', movieId, watchedAt)) return false;

  try {
    const result = watchHistoryLogService.logWatch(db, {
      mediaType: 'movie',
      mediaId: movieId,
      watchedAt,
      completed: 1,
      source: 'plex_sync',
    });
    return result.created;
  } catch {
    return false;
  }
}
