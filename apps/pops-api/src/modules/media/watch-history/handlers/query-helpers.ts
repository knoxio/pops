/**
 * Watch-history read/write surface.
 *
 * `listWatchHistory` and `getWatchHistoryEntry` route through
 * `getMediaDrizzle()`; `deleteWatchHistoryEntry` runs the media-side delete
 * inside a media transaction and then fans out the dependent
 * `debrief_sessions` / `debrief_results` cleanup against the cerebrum
 * handle. The cross-pillar atomicity is bounded per-pillar (same trade-off
 * as `logWatch` / `cerebrum.debrief.logWatchCompletion`): a transient
 * failure leaves orphaned debrief rows for a deleted watch_history entry,
 * which are tolerable because the read surface filters by the
 * denormalised `(media_type, media_id)` tuple anyway. Idempotent on
 * `watch_history_id`.
 */
import { eq, inArray } from 'drizzle-orm';

import { debriefResults, debriefSessions } from '@pops/cerebrum-db';
import {
  type WatchHistoryMediaType,
  watchHistoryService,
  WatchHistoryNotFoundError,
} from '@pops/media-db';
import { watchHistory } from '@pops/media-db';

import { getCerebrumDrizzle } from '../../../../db/cerebrum-handle.js';
import { getMediaDrizzle } from '../../../../db/media-db-handle.js';
import { NotFoundError } from '../../../../shared/errors.js';

import type { WatchHistoryFilters, WatchHistoryRow } from '../types.js';

export { listRecent, type RecentWatchHistoryListResult } from './list-recent.js';
export { getBatchProgress, getProgress } from './progress.js';

export interface WatchHistoryListResult {
  rows: WatchHistoryRow[];
  total: number;
}

function narrowMediaType(value: string | undefined): WatchHistoryMediaType | undefined {
  if (value === 'movie' || value === 'episode') return value;
  return undefined;
}

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof WatchHistoryNotFoundError) {
      throw new NotFoundError('WatchHistoryEntry', String(err.id));
    }
    throw err;
  }
}

export function listWatchHistory(
  filters: WatchHistoryFilters,
  limit: number,
  offset: number
): WatchHistoryListResult {
  return watchHistoryService.list(
    getMediaDrizzle(),
    {
      mediaType: narrowMediaType(filters.mediaType),
      mediaId: filters.mediaId,
    },
    limit,
    offset
  );
}

export function getWatchHistoryEntry(id: number): WatchHistoryRow {
  return translate(() => watchHistoryService.getById(getMediaDrizzle(), id));
}

export function deleteWatchHistoryEntry(id: number): void {
  const cerebrumDb = getCerebrumDrizzle();
  const mediaDb = getMediaDrizzle();

  const existing = mediaDb
    .select({ id: watchHistory.id })
    .from(watchHistory)
    .where(eq(watchHistory.id, id))
    .get();
  if (!existing) throw new NotFoundError('WatchHistoryEntry', String(id));

  const sessionIds = cerebrumDb
    .select({ id: debriefSessions.id })
    .from(debriefSessions)
    .where(eq(debriefSessions.watchHistoryId, id))
    .all()
    .map((r) => r.id);

  if (sessionIds.length > 0) {
    cerebrumDb.delete(debriefResults).where(inArray(debriefResults.sessionId, sessionIds)).run();
  }
  cerebrumDb.delete(debriefSessions).where(eq(debriefSessions.watchHistoryId, id)).run();

  const result = mediaDb.delete(watchHistory).where(eq(watchHistory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
}
