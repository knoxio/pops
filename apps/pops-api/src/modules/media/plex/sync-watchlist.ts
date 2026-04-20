import { and, eq, isNotNull } from 'drizzle-orm';

/**
 * Plex watchlist sync — polls the Plex Discover cloud API and syncs
 * watchlist items into the POPS watchlist.
 *
 * Implementation is split across:
 *  - sync-watchlist-fetch.ts    — Plex API + pagination
 *  - sync-watchlist-search.ts   — TMDB/TVDB title-based search fallbacks
 *  - sync-watchlist-resolve.ts  — Resolve a Plex item to a POPS movie/show
 */
import { mediaWatchlist } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../db.js';
import { getPlexClientId } from './service.js';
import { fetchPlexWatchlist } from './sync-watchlist-fetch.js';
import { resolveMediaItem } from './sync-watchlist-resolve.js';

import type { PlexMediaItem } from './types.js';

export { fetchPlexWatchlist } from './sync-watchlist-fetch.js';

export interface WatchlistSyncProgress {
  total: number;
  processed: number;
  added: number;
  removed: number;
  skipped: number;
  errors: WatchlistSyncError[];
  skipReasons: WatchlistSkipReason[];
}

export interface WatchlistSyncError {
  title: string;
  reason: string;
}

export interface WatchlistSkipReason {
  title: string;
  reason: string;
}

export interface WatchlistSyncOptions {
  onProgress?: (progress: WatchlistSyncProgress) => void;
}

async function syncSingleWatchlistItem(
  item: PlexMediaItem,
  plexRatingKey: string,
  progress: WatchlistSyncProgress
): Promise<void> {
  const db = getDrizzle();
  const { resolved, skipReason } = await resolveMediaItem(item);
  if (!resolved) {
    progress.skipped++;
    progress.skipReasons.push({
      title: item.title,
      reason: skipReason ?? 'Could not resolve media item',
    });
    return;
  }

  const { mediaType, mediaId } = resolved;
  const existing = db
    .select()
    .from(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, mediaType), eq(mediaWatchlist.mediaId, mediaId)))
    .get();

  if (existing) {
    if (existing.source === 'manual') {
      db.update(mediaWatchlist)
        .set({ source: 'both', plexRatingKey })
        .where(eq(mediaWatchlist.id, existing.id))
        .run();
    } else if (!existing.source || existing.source === 'plex') {
      db.update(mediaWatchlist)
        .set({ source: 'plex', plexRatingKey })
        .where(eq(mediaWatchlist.id, existing.id))
        .run();
    }
    progress.skipped++;
    progress.skipReasons.push({ title: item.title, reason: 'Already on watchlist' });
    return;
  }

  db.insert(mediaWatchlist).values({ mediaType, mediaId, source: 'plex', plexRatingKey }).run();
  progress.added++;
}

/**
 * Remove or downgrade POPS watchlist entries that are no longer on the Plex watchlist.
 *
 * - source="plex" and not in Plex → delete
 * - source="both" and not in Plex → downgrade to "manual"
 */
function handleRemovals(seenPlexRatingKeys: Set<string>, progress: WatchlistSyncProgress): void {
  const db = getDrizzle();
  const plexEntries = db
    .select()
    .from(mediaWatchlist)
    .where(isNotNull(mediaWatchlist.plexRatingKey))
    .all();

  getDb().transaction(() => {
    for (const entry of plexEntries) {
      if (!entry.plexRatingKey) continue;
      if (seenPlexRatingKeys.has(entry.plexRatingKey)) continue;
      if (entry.source === 'plex') {
        db.delete(mediaWatchlist).where(eq(mediaWatchlist.id, entry.id)).run();
        progress.removed++;
      } else if (entry.source === 'both') {
        db.update(mediaWatchlist)
          .set({ source: 'manual', plexRatingKey: null })
          .where(eq(mediaWatchlist.id, entry.id))
          .run();
      }
    }
  })();
}

/**
 * Sync the Plex Universal Watchlist into the POPS watchlist.
 */
export async function syncWatchlistFromPlex(
  token: string,
  options: WatchlistSyncOptions = {}
): Promise<WatchlistSyncProgress> {
  const clientId = getPlexClientId();
  const plexItems = await fetchPlexWatchlist(token, clientId);

  const progress: WatchlistSyncProgress = {
    total: plexItems.length,
    processed: 0,
    added: 0,
    removed: 0,
    skipped: 0,
    errors: [],
    skipReasons: [],
  };

  const seenPlexRatingKeys = new Set<string>();
  for (const item of plexItems) {
    try {
      seenPlexRatingKeys.add(item.ratingKey);
      await syncSingleWatchlistItem(item, item.ratingKey, progress);
    } catch (err) {
      progress.errors.push({
        title: item.title,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
    progress.processed++;
    options.onProgress?.(progress);
  }

  handleRemovals(seenPlexRatingKeys, progress);
  return progress;
}
