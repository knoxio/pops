/**
 * Data fetchers for smart-pair selection. Raw SQL via drizzle's `db.all` plus
 * a couple of query-builder reads. HTTP-free, `(db, …)` arg.
 */
import { eq, sql } from 'drizzle-orm';

import { mediaWatchlist } from '../../../schema.js';
import { getGlobalComparisonCount } from '../comparison-queries.js';

import type { MediaDb } from '../../internal.js';

export interface WatchedMovie {
  mediaId: number;
  lastWatchedAt: string;
}

export interface MovieMeta {
  id: number;
  title: string;
  posterPath: string | null;
  tmdbId: number;
  posterOverridePath: string | null;
}

export interface ScoreRow {
  mediaId: number;
  score: number;
  comparisonCount: number;
}

/** Distinct completed, non-blacklisted watched movie ids with their last watch date. */
export function fetchWatchedMovies(db: MediaDb): WatchedMovie[] {
  return db.all<WatchedMovie>(sql`
    SELECT wh.media_id AS mediaId, MAX(wh.watched_at) AS lastWatchedAt
    FROM watch_history wh
    WHERE wh.media_type = 'movie' AND wh.completed = 1 AND wh.blacklisted = 0
    GROUP BY wh.media_id
  `);
}

export function fetchWatchlistedIds(db: MediaDb): Set<number> {
  return new Set(
    db
      .select({ mediaId: mediaWatchlist.mediaId })
      .from(mediaWatchlist)
      .where(eq(mediaWatchlist.mediaType, 'movie'))
      .all()
      .map((r) => r.mediaId)
  );
}

export function fetchExcludedIds(db: MediaDb, dimensionId: number): Set<number> {
  const rows = db.all<{ media_id: number }>(sql`
    SELECT media_id FROM media_scores
    WHERE dimension_id = ${dimensionId} AND media_type = 'movie' AND excluded = 1
  `);
  return new Set(rows.map((r) => r.media_id));
}

export function fetchCooloffPairs(db: MediaDb, dimensionId: number): Set<string> {
  const globalCount = getGlobalComparisonCount(db);
  const rows = db.all<{ media_a_id: number; media_b_id: number }>(sql`
    SELECT media_a_id, media_b_id FROM comparison_skip_cooloffs
    WHERE dimension_id = ${dimensionId} AND media_a_type = 'movie' AND media_b_type = 'movie'
      AND skip_until > ${globalCount}
  `);
  const set = new Set<string>();
  for (const r of rows) {
    set.add(`${r.media_a_id}-${r.media_b_id}`);
    set.add(`${r.media_b_id}-${r.media_a_id}`);
  }
  return set;
}

export function fetchScoreMap(
  db: MediaDb,
  dimensionId: number,
  movieIds: number[]
): Map<number, { score: number; comparisonCount: number }> {
  const map = new Map<number, { score: number; comparisonCount: number }>();
  if (movieIds.length === 0) return map;
  const rows = db.all<ScoreRow>(sql`
    SELECT media_id AS mediaId, score, comparison_count AS comparisonCount
    FROM media_scores
    WHERE dimension_id = ${dimensionId} AND media_type = 'movie'
      AND media_id IN (${sql.join(
        movieIds.map((id) => sql`${id}`),
        sql`, `
      )})
  `);
  for (const row of rows) {
    map.set(row.mediaId, { score: row.score, comparisonCount: row.comparisonCount });
  }
  return map;
}

export function fetchPairCountMap(
  db: MediaDb,
  dimensionId: number,
  movieIds: number[]
): Map<string, number> {
  const map = new Map<string, number>();
  if (movieIds.length === 0) return map;
  const idList = sql.join(
    movieIds.map((id) => sql`${id}`),
    sql`, `
  );
  const rows = db.all<{ mediaAId: number; mediaBId: number; cnt: number }>(sql`
    SELECT media_a_id AS mediaAId, media_b_id AS mediaBId, COUNT(*) AS cnt
    FROM comparisons
    WHERE dimension_id = ${dimensionId} AND media_a_type = 'movie' AND media_b_type = 'movie'
      AND media_a_id IN (${idList}) AND media_b_id IN (${idList})
    GROUP BY media_a_id, media_b_id
  `);
  for (const row of rows) {
    const existing = map.get(`${row.mediaAId}-${row.mediaBId}`) ?? 0;
    map.set(`${row.mediaAId}-${row.mediaBId}`, existing + row.cnt);
    map.set(`${row.mediaBId}-${row.mediaAId}`, existing + row.cnt);
  }
  return map;
}

export function fetchMovieMetaMap(db: MediaDb, movieIds: number[]): Map<number, MovieMeta> {
  if (movieIds.length === 0) return new Map();
  const rows = db.all<MovieMeta>(sql`
    SELECT id, title, poster_path AS posterPath, tmdb_id AS tmdbId,
           poster_override_path AS posterOverridePath
    FROM movies WHERE id IN (${sql.join(
      movieIds.map((id) => sql`${id}`),
      sql`, `
    )})
  `);
  return new Map(rows.map((r) => [r.id, r]));
}
