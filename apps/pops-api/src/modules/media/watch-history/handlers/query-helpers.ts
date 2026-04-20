import { and, count, desc, eq, type SQL } from 'drizzle-orm';

import { watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { NotFoundError } from '../../../../shared/errors.js';

import type { WatchHistoryFilters, WatchHistoryRow } from '../types.js';

export { listRecent, type RecentWatchHistoryListResult } from './list-recent.js';
export { getBatchProgress, getProgress } from './progress.js';

export interface WatchHistoryListResult {
  rows: WatchHistoryRow[];
  total: number;
}

export function listWatchHistory(
  filters: WatchHistoryFilters,
  limit: number,
  offset: number
): WatchHistoryListResult {
  const db = getDrizzle();
  const conditions: SQL[] = [];
  if (filters.mediaType) {
    conditions.push(eq(watchHistory.mediaType, filters.mediaType as 'movie' | 'episode'));
  }
  if (filters.mediaId) conditions.push(eq(watchHistory.mediaId, filters.mediaId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = db
    .select()
    .from(watchHistory)
    .where(where)
    .orderBy(desc(watchHistory.watchedAt))
    .limit(limit)
    .offset(offset)
    .all();
  const [countRow] = db.select({ total: count() }).from(watchHistory).where(where).all();
  return { rows, total: countRow?.total ?? 0 };
}

export function getWatchHistoryEntry(id: number): WatchHistoryRow {
  const db = getDrizzle();
  const row = db.select().from(watchHistory).where(eq(watchHistory.id, id)).get();
  if (!row) throw new NotFoundError('WatchHistoryEntry', String(id));
  return row;
}

export function deleteWatchHistoryEntry(id: number): void {
  getWatchHistoryEntry(id);
  const result = getDrizzle().delete(watchHistory).where(eq(watchHistory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
}
