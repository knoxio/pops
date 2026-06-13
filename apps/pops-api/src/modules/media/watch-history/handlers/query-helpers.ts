/**
 * Watch-history read/write surface — PRD-168 PR2 + PR3 cutover.
 *
 * Read/write split during the migration window:
 *  - `listWatchHistory` and `getWatchHistoryEntry` are routed through
 *    `getMediaDrizzle()` (the media pillar's `media.db.watch_history`).
 *    These are the simple reads called out by PRD-168 PR2.
 *  - Every write path — `logWatch` in `./log-watch-event.ts`,
 *    `deleteWatchHistoryEntry` below, `batchLogWatch`, the cascade
 *    deletes for `debrief_sessions` / `debrief_results` — still goes
 *    through `getDrizzle()` (the shared `pops.db`). PR3 audit confirmed
 *    every writer in the pops-api watch-history surface is a mixed-table
 *    transaction spanning `watch_history` plus at least one of
 *    `episodes`, `seasons`, `mediaWatchlist`, `debrief_sessions`, or
 *    `debrief_results`. None of those tables live in `@pops/media-db`
 *    yet, so flipping `watch_history` alone would split a single
 *    transaction across two SQLite files. PR3 therefore defers the
 *    writes cutover until the dependent slices ship their own
 *    `getMediaDrizzle()` / `getCerebrumDrizzle()` handles. See the
 *    per-handler headers in `./log-watch-event.ts` and
 *    `./batch-operations.ts` for the table-by-table breakdown.
 *
 * Cross-store consistency relies on `backfillMediaFromShared()` in
 * `apps/pops-api/src/db/media-backfill.ts`: a one-way, boot-time copy
 * from `pops.db` -> `media.db` that idempotently fills missing rows.
 * Between boots, newly-logged events live only in `pops.db` and won't
 * appear in list/get results until the next deploy reruns the backfill.
 * This is the same trade-off taken by the movies (PRD-165) and
 * tv-shows (PRD-166) cutovers; the full read-your-writes consistency
 * lands when the write paths also cut over.
 *
 * TOCTOU fix: `deleteWatchHistoryEntry` deletes from `pops.db`, so its
 * existence check must read from the same store. The function relies on
 * the in-transaction `result.changes === 0` signal (against `pops.db`)
 * rather than `getWatchHistoryEntry` (against `media.db`) to avoid a
 * race where the row exists on one side but not the other.
 */
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
  getDrizzle().transaction((tx) => {
    const existing = tx
      .select({ id: watchHistory.id })
      .from(watchHistory)
      .where(eq(watchHistory.id, id))
      .get();
    if (!existing) throw new NotFoundError('WatchHistoryEntry', String(id));

    const sessionIds = tx
      .select({ id: debriefSessions.id })
      .from(debriefSessions)
      .where(eq(debriefSessions.watchHistoryId, id))
      .all()
      .map((r) => r.id);

    if (sessionIds.length > 0) {
      tx.delete(debriefResults).where(inArray(debriefResults.sessionId, sessionIds)).run();
    }

    tx.delete(debriefSessions).where(eq(debriefSessions.watchHistoryId, id)).run();

    const result = tx.delete(watchHistory).where(eq(watchHistory.id, id)).run();
    if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
  });
}
