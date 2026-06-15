/**
 * Watch-history read/write surface. All operations route through
 * `getMediaDrizzle()`. Idempotent on `watch_history_id`.
 */
import { eq } from 'drizzle-orm';

import {
  type WatchHistoryMediaType,
  watchHistoryService,
  WatchHistoryNotFoundError,
} from '@pops/media-db';
import { watchHistory } from '@pops/media-db';

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
  const mediaDb = getMediaDrizzle();
  const result = mediaDb.delete(watchHistory).where(eq(watchHistory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
}
