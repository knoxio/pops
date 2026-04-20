import { eq } from 'drizzle-orm';

import { mediaWatchlist } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../../db.js';
import { getGlobalComparisonCount } from '../global-count.js';

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

export function fetchWatchedMovies(): WatchedMovie[] {
  const rawDb = getDb();
  return rawDb
    .prepare(
      `SELECT wh.media_id as mediaId,
              MAX(wh.watched_at) as lastWatchedAt
       FROM watch_history wh
       WHERE wh.media_type = 'movie'
         AND wh.completed = 1
         AND wh.blacklisted = 0
       GROUP BY wh.media_id`
    )
    .all() as WatchedMovie[];
}

export function fetchWatchlistedIds(): Set<number> {
  const db = getDrizzle();
  return new Set(
    db
      .select({ mediaId: mediaWatchlist.mediaId })
      .from(mediaWatchlist)
      .where(eq(mediaWatchlist.mediaType, 'movie'))
      .all()
      .map((r) => r.mediaId)
  );
}

export function fetchExcludedIds(dimensionId: number): Set<number> {
  const rawDb = getDb();
  const rows = rawDb
    .prepare(
      `SELECT media_id FROM media_scores
       WHERE dimension_id = ? AND media_type = 'movie' AND excluded = 1`
    )
    .all(dimensionId) as Array<{ media_id: number }>;
  return new Set(rows.map((r) => r.media_id));
}

export function fetchCooloffPairs(dimensionId: number): Set<string> {
  const rawDb = getDb();
  const globalCount = getGlobalComparisonCount();
  const rows = rawDb
    .prepare(
      `SELECT media_a_id, media_b_id FROM comparison_skip_cooloffs
       WHERE dimension_id = ? AND media_a_type = 'movie' AND media_b_type = 'movie'
         AND skip_until > ?`
    )
    .all(dimensionId, globalCount) as Array<{ media_a_id: number; media_b_id: number }>;
  const set = new Set<string>();
  for (const r of rows) {
    set.add(`${r.media_a_id}-${r.media_b_id}`);
    set.add(`${r.media_b_id}-${r.media_a_id}`);
  }
  return set;
}

export function fetchScoreMap(
  dimensionId: number,
  movieIds: number[]
): Map<number, { score: number; comparisonCount: number }> {
  if (movieIds.length === 0) return new Map();
  const rawDb = getDb();
  const placeholders = movieIds.map(() => '?').join(',');
  const scoreRows = rawDb
    .prepare(
      `SELECT media_id as mediaId, score, comparison_count as comparisonCount
       FROM media_scores
       WHERE dimension_id = ? AND media_type = 'movie' AND media_id IN (${placeholders})`
    )
    .all(dimensionId, ...movieIds) as ScoreRow[];
  const map = new Map<number, { score: number; comparisonCount: number }>();
  for (const row of scoreRows) {
    map.set(row.mediaId, { score: row.score, comparisonCount: row.comparisonCount });
  }
  return map;
}

export function fetchPairCountMap(dimensionId: number, movieIds: number[]): Map<string, number> {
  if (movieIds.length === 0) return new Map();
  const rawDb = getDb();
  const placeholders = movieIds.map(() => '?').join(',');
  const rows = rawDb
    .prepare(
      `SELECT media_a_id as mediaAId, media_b_id as mediaBId, COUNT(*) as cnt
       FROM comparisons
       WHERE dimension_id = ? AND media_a_type = 'movie' AND media_b_type = 'movie'
         AND media_a_id IN (${placeholders}) AND media_b_id IN (${placeholders})
       GROUP BY media_a_id, media_b_id`
    )
    .all(dimensionId, ...movieIds, ...movieIds) as Array<{
    mediaAId: number;
    mediaBId: number;
    cnt: number;
  }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    const key1 = `${row.mediaAId}-${row.mediaBId}`;
    const key2 = `${row.mediaBId}-${row.mediaAId}`;
    const existing = map.get(key1) ?? 0;
    map.set(key1, existing + row.cnt);
    map.set(key2, existing + row.cnt);
  }
  return map;
}

export function fetchMovieMetaMap(movieIds: number[]): Map<number, MovieMeta> {
  if (movieIds.length === 0) return new Map();
  const rawDb = getDb();
  const placeholders = movieIds.map(() => '?').join(',');
  const rows = rawDb
    .prepare(
      `SELECT id, title, poster_path as posterPath, tmdb_id as tmdbId, poster_override_path as posterOverridePath
       FROM movies WHERE id IN (${placeholders})`
    )
    .all(...movieIds) as MovieMeta[];
  return new Map(rows.map((r) => [r.id, r]));
}
