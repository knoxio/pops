/**
 * Watch-history read/write surface.
 *
 * `listWatchHistory` and `getWatchHistoryEntry` route through
 * `getMediaDrizzle()`; `deleteWatchHistoryEntry` (PRD-248 US-05c)
 * cascade-deletes the dependent `debrief_sessions` / `debrief_results`
 * rows via the cross-pillar SDK
 * (`pillar('cerebrum').debrief.deleteByWatchHistoryId`) BEFORE the
 * media-side delete commits — matching the same cross-pillar contract
 * `log-watch-event.ts` uses for the write path. The SDK call runs first
 * so a transient cerebrum failure aborts the whole delete and the user
 * can retry; once the SDK acknowledges the cascade, the media-side
 * `watch_history` row is removed. Idempotent on `watch_history_id` —
 * re-running converges on "no debrief, no watch row".
 */
import { eq } from 'drizzle-orm';

import {
  type WatchHistoryMediaType,
  watchHistoryService,
  WatchHistoryNotFoundError,
} from '@pops/media-db';
import { watchHistory } from '@pops/media-db';
import { pillar } from '@pops/pillar-sdk/server';

import { getMediaDrizzle } from '../../../../db/media-db-handle.js';
import { NotFoundError } from '../../../../shared/errors.js';

import type { WatchHistoryFilters, WatchHistoryRow } from '../types.js';

export { listRecent, type RecentWatchHistoryListResult } from './list-recent.js';
export { getBatchProgress, getProgress } from './progress.js';

export interface WatchHistoryListResult {
  rows: WatchHistoryRow[];
  total: number;
}

interface DeleteByWatchHistoryIdResultShape {
  deletedSessions: number;
  deletedResults: number;
}

type CerebrumDebriefShape = {
  debrief: {
    deleteByWatchHistoryId: (input: {
      watchHistoryId: number;
    }) => DeleteByWatchHistoryIdResultShape;
  };
};

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

export async function deleteWatchHistoryEntry(id: number): Promise<void> {
  const mediaDb = getMediaDrizzle();

  const existing = mediaDb
    .select({ id: watchHistory.id })
    .from(watchHistory)
    .where(eq(watchHistory.id, id))
    .get();
  if (!existing) throw new NotFoundError('WatchHistoryEntry', String(id));

  await pillar<CerebrumDebriefShape>('cerebrum').debrief.deleteByWatchHistoryId.orThrow({
    watchHistoryId: id,
  });

  const result = mediaDb.delete(watchHistory).where(eq(watchHistory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
}
