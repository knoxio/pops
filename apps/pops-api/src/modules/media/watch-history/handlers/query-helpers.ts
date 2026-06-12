import { eq, inArray } from 'drizzle-orm';

import { debriefResults, debriefSessions, watchHistory } from '@pops/db-types';
import {
  type WatchHistoryMediaType,
  watchHistoryService,
  WatchHistoryNotFoundError,
} from '@pops/media-db';

import { getDrizzle } from '../../../../db.js';
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
  getWatchHistoryEntry(id);

  getDrizzle().transaction((tx) => {
    // Cascade: delete debrief_results rows that belong to sessions referencing this entry.
    const sessionIds = tx
      .select({ id: debriefSessions.id })
      .from(debriefSessions)
      .where(eq(debriefSessions.watchHistoryId, id))
      .all()
      .map((r) => r.id);

    if (sessionIds.length > 0) {
      tx.delete(debriefResults).where(inArray(debriefResults.sessionId, sessionIds)).run();
    }

    // Cascade: delete debrief_sessions rows referencing this watch_history entry.
    tx.delete(debriefSessions).where(eq(debriefSessions.watchHistoryId, id)).run();

    // Now safe to delete the watch_history row.
    const result = tx.delete(watchHistory).where(eq(watchHistory.id, id)).run();
    if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
  });
}
