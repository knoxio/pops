/**
 * `logWatch` — transactional watch-event logging with watchlist auto-removal.
 *
 * Lifted from the monolith `watch-history/handlers/log-watch-event.ts` +
 * `auto-remove-show.ts` and converted to the pillar's `(db, …)` arg-passing
 * pattern. All media-only writes (watch_history insert, comparison-staleness
 * reset, watchlist removal, priority resequence) run inside a single
 * `db.transaction(...)`.
 */
import { and, countDistinct, eq, inArray } from 'drizzle-orm';

import { episodes, mediaWatchlist, seasons, watchHistory } from '../schema.js';
import { resetStaleness } from './comparisons/staleness.js';
import { resolveComparisonTarget } from './watch-history-comp-target.js';
import { resequencePriorities } from './watchlist.js';

import type { MediaDb } from './internal.js';
import type { WatchHistoryRow } from './watch-history.js';

type Tx = Parameters<Parameters<MediaDb['transaction']>[0]>[0];

/** Input accepted by {@link logWatch}. Mirrors the monolith `LogWatchInput`. */
export interface LogWatchInput {
  mediaType: 'movie' | 'episode';
  mediaId: number;
  watchedAt?: string | undefined;
  completed?: number | undefined;
  source?: 'manual' | 'plex_sync' | undefined;
}

/** Result of a single watch-log. */
export interface LogWatchResult {
  entry: WatchHistoryRow;
  created: boolean;
  watchlistRemoved: boolean;
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

/**
 * When every episode of the episode's parent show has a completed watch,
 * delete the show's watchlist row. Returns whether a row was removed.
 */
export function autoRemoveTvShowIfFullyWatched(tx: Tx, episodeId: number): boolean {
  const episode = tx
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  if (!episode) return false;

  const season = tx
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, episode.seasonId))
    .get();
  if (!season) return false;

  const tvShowId = season.tvShowId;
  const showEpisodeIds = tx
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .all()
    .map((r) => r.id);
  if (showEpisodeIds.length === 0) return false;

  const watchedRow = tx
    .select({ watched: countDistinct(watchHistory.mediaId) })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        inArray(watchHistory.mediaId, showEpisodeIds)
      )
    )
    .all()[0];
  const watched = watchedRow?.watched ?? 0;

  if (watched < showEpisodeIds.length) return false;
  const deleteResult = tx
    .delete(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, 'tv_show'), eq(mediaWatchlist.mediaId, tvShowId)))
    .run();
  return deleteResult.changes > 0;
}

function removeFromWatchlist(tx: Tx, input: LogWatchInput): boolean {
  if (input.mediaType === 'movie') {
    const deleteResult = tx
      .delete(mediaWatchlist)
      .where(and(eq(mediaWatchlist.mediaType, 'movie'), eq(mediaWatchlist.mediaId, input.mediaId)))
      .run();
    return deleteResult.changes > 0;
  }
  return autoRemoveTvShowIfFullyWatched(tx, input.mediaId);
}

function unchanged(entry: WatchHistoryRow): LogWatchResult {
  return { entry, created: false, watchlistRemoved: false };
}

function runMediaTx(
  input: LogWatchInput,
  completed: number,
  watchedAt: string
): (tx: Tx) => LogWatchResult {
  return (tx) => {
    const blacklisted = findBlacklistedEntry(tx, input, watchedAt);
    if (blacklisted) return unchanged(blacklisted);

    const result = tx
      .insert(watchHistory)
      .values({ mediaType: input.mediaType, mediaId: input.mediaId, watchedAt, completed })
      .onConflictDoNothing()
      .run();

    if (result.changes === 0) {
      const existing = findExistingEntry(tx, input, watchedAt);
      if (!existing) throw new Error('Watch history entry not found after conflict');
      return unchanged(existing);
    }

    const entry = tx
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.id, Number(result.lastInsertRowid)))
      .get();
    if (!entry) throw new Error('Watch history entry not found after insert');

    if (completed === 1) {
      const target = resolveComparisonTarget(tx, input.mediaType, input.mediaId);
      resetStaleness(tx, target.type, target.id);
    }

    let watchlistRemoved = false;
    if (completed === 1 && input.source !== 'plex_sync') {
      watchlistRemoved = removeFromWatchlist(tx, input);
      if (watchlistRemoved) resequencePriorities(tx);
    }

    return { entry, created: true, watchlistRemoved };
  };
}

/** Log a single watch event inside a transaction. Idempotent on the unique key. */
export function logWatch(db: MediaDb, input: LogWatchInput): LogWatchResult {
  const completed = input.completed ?? 1;
  const watchedAt = input.watchedAt ?? new Date().toISOString();
  return db.transaction(runMediaTx(input, completed, watchedAt));
}
