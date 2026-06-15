/**
 * `logWatch` — Option D (PRD-248 US-05c). The media-only writes
 * (watch_history insert, watchlist removal, episodes/seasons resolution,
 * comparison_staleness reset, watchlist priority resequence) run inside a
 * single `getMediaDrizzle().transaction(...)`. After commit we fan out to
 * `pillar('cerebrum').debrief.logWatchCompletion` via the cross-pillar
 * SDK (see `cerebrum-fan-out.ts`); failures are logged and swallowed
 * because the writer is idempotent on `(watchHistoryId, mediaType,
 * mediaId)`. No fan-out for already-existing rows (no fresh completion)
 * or incomplete watches.
 *
 * The fan-out helper is fire-and-forget so `logWatch` keeps its sync
 * signature — flipping it to `async` would cascade through the
 * out-of-scope `plex/`, `arr/`, and `rotation/` callers. The watch row
 * is the source of truth; the cerebrum side-effect self-heals on the
 * next completion (idempotent re-create) or the deferred reconciler.
 */
import { and, eq } from 'drizzle-orm';

import { episodes, mediaWatchlist, seasons, watchHistory } from '@pops/media-db';

import { getMediaDrizzle } from '../../../../db/media-db-handle.js';
import { resetStaleness } from '../../comparisons/staleness.js';
import { resequencePriorities } from '../../watchlist/service.js';
import { autoRemoveTvShowIfFullyWatched } from './auto-remove-show.js';
import { fanOutDebriefCompletion } from './cerebrum-fan-out.js';

import type { MediaDb } from '@pops/media-db';

export { autoRemoveTvShowIfFullyWatched } from './auto-remove-show.js';

import type { LogWatchInput, WatchHistoryRow } from '../types.js';

type Tx = Parameters<Parameters<MediaDb['transaction']>[0]>[0];

export interface LogWatchResult {
  entry: WatchHistoryRow;
  created: boolean;
  watchlistRemoved: boolean;
}

interface MediaTxOutcome extends LogWatchResult {
  fanOutCompletion: boolean;
  completionMediaType: 'movie' | 'episode';
}

function findBlacklistedEntry(
  tx: Tx,
  input: LogWatchInput,
  watchedAt: string
): WatchHistoryRow | undefined {
  return tx
    .select()
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, input.mediaType),
        eq(watchHistory.mediaId, input.mediaId),
        eq(watchHistory.watchedAt, watchedAt),
        eq(watchHistory.blacklisted, 1)
      )
    )
    .get();
}

function findExistingEntry(
  tx: Tx,
  input: LogWatchInput,
  watchedAt: string
): WatchHistoryRow | undefined {
  return tx
    .select()
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, input.mediaType),
        eq(watchHistory.mediaId, input.mediaId),
        eq(watchHistory.watchedAt, watchedAt)
      )
    )
    .get();
}

function resolveCompTarget(tx: Tx, input: LogWatchInput): { type: string; id: number } {
  if (input.mediaType !== 'episode') return { type: input.mediaType, id: input.mediaId };
  const ep = tx
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, input.mediaId))
    .get();
  if (!ep) return { type: input.mediaType, id: input.mediaId };
  const season = tx
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, ep.seasonId))
    .get();
  if (!season) return { type: input.mediaType, id: input.mediaId };
  return { type: 'tv_show', id: season.tvShowId };
}

function resetStalenessOnCompletion(tx: Tx, input: LogWatchInput): void {
  const target = resolveCompTarget(tx, input);
  resetStaleness(target.type, target.id, tx);
}

function removeFromWatchlist(tx: Tx, input: LogWatchInput): boolean {
  if (input.mediaType === 'movie') {
    const deleteResult = tx
      .delete(mediaWatchlist)
      .where(and(eq(mediaWatchlist.mediaType, 'movie'), eq(mediaWatchlist.mediaId, input.mediaId)))
      .run();
    return deleteResult.changes > 0;
  }
  if (input.mediaType === 'episode') {
    return autoRemoveTvShowIfFullyWatched(tx, input.mediaId);
  }
  return false;
}

function noFanOut(entry: WatchHistoryRow, mediaType: 'movie' | 'episode'): MediaTxOutcome {
  return {
    entry,
    created: false,
    watchlistRemoved: false,
    fanOutCompletion: false,
    completionMediaType: mediaType,
  };
}

function runMediaTx(
  input: LogWatchInput,
  completed: number,
  watchedAt: string
): (tx: Tx) => MediaTxOutcome {
  return (tx) => {
    const blacklisted = findBlacklistedEntry(tx, input, watchedAt);
    if (blacklisted) return noFanOut(blacklisted, input.mediaType);

    const result = tx
      .insert(watchHistory)
      .values({ mediaType: input.mediaType, mediaId: input.mediaId, watchedAt, completed })
      .onConflictDoNothing()
      .run();

    if (result.changes === 0) {
      const existing = findExistingEntry(tx, input, watchedAt);
      if (!existing) throw new Error('Watch history entry not found after conflict');
      return noFanOut(existing, input.mediaType);
    }

    const entry = tx
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.id, Number(result.lastInsertRowid)))
      .get();
    if (!entry) throw new Error('Watch history entry not found after insert');

    if (completed === 1) resetStalenessOnCompletion(tx, input);

    let watchlistRemoved = false;
    if (completed === 1 && input.source !== 'plex_sync') {
      watchlistRemoved = removeFromWatchlist(tx, input);
      if (watchlistRemoved) resequencePriorities(tx);
    }

    return {
      entry,
      created: true,
      watchlistRemoved,
      fanOutCompletion: completed === 1,
      completionMediaType: input.mediaType,
    };
  };
}

export function logWatch(input: LogWatchInput): LogWatchResult {
  const db = getMediaDrizzle();
  const completed = input.completed ?? 1;
  const watchedAt = input.watchedAt ?? new Date().toISOString();

  const outcome = db.transaction(runMediaTx(input, completed, watchedAt));

  if (outcome.fanOutCompletion) {
    fanOutDebriefCompletion({
      mediaType: outcome.completionMediaType,
      mediaId: outcome.entry.mediaId,
      watchHistoryId: outcome.entry.id,
    });
  }

  return {
    entry: outcome.entry,
    created: outcome.created,
    watchlistRemoved: outcome.watchlistRemoved,
  };
}
