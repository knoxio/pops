/**
 * Watch-progress computation for TV shows against the media pillar's SQLite.
 *
 * Lifted verbatim from the monolith `watch-history/handlers/progress.ts` and
 * converted to the pillar's `(db, …)` arg-passing + db-domain-error pattern
 * (the monolith threw `NotFoundError` directly; the pillar keeps the db layer
 * HTTP-free and maps `TvShowNotFoundError` to a 404 at the handler boundary).
 *
 * `completed = 1` watch_history rows are joined back through
 * episodes → seasons to attribute watches per season / per show; the
 * next-unwatched-episode pointer scans episodes in (seasonNumber,
 * episodeNumber) order and returns the first one with no completed watch.
 */
import { and, count, countDistinct, eq, inArray } from 'drizzle-orm';

import { TvShowNotFoundError } from '../errors.js';
import { episodes, seasons, tvShows, watchHistory } from '../schema.js';

import type { MediaDb } from './internal.js';

/** Progress for a single season. */
export interface SeasonProgress {
  seasonId: number;
  seasonNumber: number;
  watched: number;
  total: number;
  percentage: number;
}

/** Next unwatched episode pointer. */
export interface NextEpisode {
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string | null;
}

/** Overall + per-season watch progress for a TV show. */
export interface TvShowProgress {
  tvShowId: number;
  overall: { watched: number; total: number; percentage: number };
  seasons: SeasonProgress[];
  nextEpisode: NextEpisode | null;
}

/** Batch progress result — percentage per TV show. */
export interface BatchProgressEntry {
  tvShowId: number;
  percentage: number;
}

function pct(watched: number, total: number): number {
  return total > 0 ? Math.round((watched / total) * 100) : 0;
}

function findNextUnwatchedEpisode(db: MediaDb, tvShowId: number): NextEpisode | null {
  const allEpisodes = db
    .select({
      episodeId: episodes.id,
      seasonNumber: seasons.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      episodeName: episodes.name,
    })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .orderBy(seasons.seasonNumber, episodes.episodeNumber)
    .all();
  if (allEpisodes.length === 0) return null;

  const watchedIds = new Set(
    db
      .select({ mediaId: watchHistory.mediaId })
      .from(watchHistory)
      .innerJoin(episodes, eq(episodes.id, watchHistory.mediaId))
      .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
      .where(
        and(
          eq(watchHistory.mediaType, 'episode'),
          eq(watchHistory.completed, 1),
          eq(seasons.tvShowId, tvShowId)
        )
      )
      .all()
      .map((r) => r.mediaId)
  );

  const next = allEpisodes.find((ep) => !watchedIds.has(ep.episodeId));
  if (!next) return null;
  return {
    seasonNumber: next.seasonNumber,
    episodeNumber: next.episodeNumber,
    episodeName: next.episodeName,
  };
}

function seasonProgressFor(db: MediaDb, tvShowId: number): SeasonProgress[] {
  const seasonRows = db
    .select({ seasonId: seasons.id, seasonNumber: seasons.seasonNumber, total: count(episodes.id) })
    .from(seasons)
    .leftJoin(episodes, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .groupBy(seasons.id)
    .orderBy(seasons.seasonNumber)
    .all();

  const watchedRows = db
    .select({ seasonId: seasons.id, watched: countDistinct(watchHistory.mediaId) })
    .from(watchHistory)
    .innerJoin(episodes, eq(episodes.id, watchHistory.mediaId))
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        eq(seasons.tvShowId, tvShowId)
      )
    )
    .groupBy(seasons.id)
    .all();

  const watchedBySeason = new Map(watchedRows.map((r) => [r.seasonId, r.watched]));
  return seasonRows.map((s) => {
    const watched = watchedBySeason.get(s.seasonId) ?? 0;
    return {
      seasonId: s.seasonId,
      seasonNumber: s.seasonNumber,
      watched,
      total: s.total,
      percentage: pct(watched, s.total),
    };
  });
}

/**
 * Per-season + overall watch progress for a single TV show. Throws
 * `TvShowNotFoundError` when the show id is unknown.
 */
export function getProgress(db: MediaDb, tvShowId: number): TvShowProgress {
  const show = db.select({ id: tvShows.id }).from(tvShows).where(eq(tvShows.id, tvShowId)).get();
  if (!show) throw new TvShowNotFoundError(tvShowId);

  const seasonProgress = seasonProgressFor(db, tvShowId);
  const totalWatched = seasonProgress.reduce((sum, s) => sum + s.watched, 0);
  const totalEpisodes = seasonProgress.reduce((sum, s) => sum + s.total, 0);

  return {
    tvShowId,
    overall: {
      watched: totalWatched,
      total: totalEpisodes,
      percentage: pct(totalWatched, totalEpisodes),
    },
    seasons: seasonProgress,
    nextEpisode: findNextUnwatchedEpisode(db, tvShowId),
  };
}

/**
 * Watch-completion percentage for a batch of TV shows — used by the library
 * grid. Shows with no episodes are omitted (the underlying join produces no
 * row), matching the monolith. Unknown ids simply don't appear.
 */
export function getBatchProgress(db: MediaDb, tvShowIds: number[]): BatchProgressEntry[] {
  if (tvShowIds.length === 0) return [];

  const totalRows = db
    .select({ tvShowId: seasons.tvShowId, total: count(episodes.id) })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(inArray(seasons.tvShowId, tvShowIds))
    .groupBy(seasons.tvShowId)
    .all();

  const watchedRows = db
    .select({ tvShowId: seasons.tvShowId, watched: countDistinct(watchHistory.mediaId) })
    .from(watchHistory)
    .innerJoin(episodes, eq(episodes.id, watchHistory.mediaId))
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        inArray(seasons.tvShowId, tvShowIds)
      )
    )
    .groupBy(seasons.tvShowId)
    .all();

  const watchedMap = new Map(watchedRows.map((r) => [r.tvShowId, r.watched]));
  return totalRows.map((row) => ({
    tvShowId: row.tvShowId,
    percentage: pct(watchedMap.get(row.tvShowId) ?? 0, row.total),
  }));
}
