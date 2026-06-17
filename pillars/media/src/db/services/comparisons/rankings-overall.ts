/**
 * Overall (cross-dimension, weight-blended) rankings. Raw SQL via drizzle's
 * `db.all` so the weighted aggregate + poster joins stay a single query.
 */
import { eq, sql, type SQL } from 'drizzle-orm';

import { comparisonDimensions } from '../../schema.js';
import { calculateOverallConfidence, type RankedMediaEntry } from './mappers.js';
import { resolvePosterUrl, type RankingRowBase } from './rankings-helpers.js';

import type { MediaDb } from '../internal.js';

export interface OverallRankingsArgs {
  mediaType: string | undefined;
  limit: number;
  offset: number;
}

export interface OverallRankingsResult {
  rows: RankedMediaEntry[];
  total: number;
}

interface OverallRow extends RankingRowBase {
  perDimCounts: string;
}

function getActiveDimensionIds(db: MediaDb): number[] {
  return db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all()
    .map((r) => r.id);
}

function dimensionIdList(ids: number[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  );
}

function mediaTypeClause(mediaType: string | undefined): SQL {
  return mediaType ? sql`AND ms.media_type = ${mediaType}` : sql``;
}

function fetchOverallCount(db: MediaDb, ids: number[], mediaType: string | undefined): number {
  const rows = db.all<{ total: number }>(sql`
    SELECT COUNT(*) AS total FROM (
      SELECT ms.media_type, ms.media_id
      FROM media_scores ms
      JOIN comparison_dimensions cd ON ms.dimension_id = cd.id
      WHERE cd.active = 1 AND ms.excluded = 0
        AND ms.dimension_id IN (${dimensionIdList(ids)}) ${mediaTypeClause(mediaType)}
      GROUP BY ms.media_type, ms.media_id
    )
  `);
  return rows[0]?.total ?? 0;
}

function fetchOverallRows(db: MediaDb, ids: number[], args: OverallRankingsArgs): OverallRow[] {
  return db.all<OverallRow>(sql`
    SELECT
      ms.media_type AS mediaType,
      ms.media_id AS mediaId,
      SUM(ms.score * cd.weight) / SUM(cd.weight) AS score,
      SUM(ms.comparison_count) AS comparisonCount,
      GROUP_CONCAT(ms.comparison_count) AS perDimCounts,
      COALESCE(m.title, tv.name, 'Unknown') AS title,
      CASE
        WHEN ms.media_type = 'movie' THEN CAST(SUBSTR(m.release_date, 1, 4) AS INTEGER)
        ELSE CAST(SUBSTR(tv.first_air_date, 1, 4) AS INTEGER)
      END AS year,
      m.poster_path AS moviePosterPath,
      m.tmdb_id AS movieTmdbId,
      m.poster_override_path AS moviePosterOverride,
      tv.poster_path AS tvPosterPath,
      tv.tvdb_id AS tvTvdbId,
      tv.poster_override_path AS tvPosterOverride
    FROM media_scores ms
    JOIN comparison_dimensions cd ON ms.dimension_id = cd.id
    LEFT JOIN movies m ON ms.media_type = 'movie' AND ms.media_id = m.id
    LEFT JOIN tv_shows tv ON ms.media_type = 'tv_show' AND ms.media_id = tv.id
    WHERE cd.active = 1 AND ms.excluded = 0
      AND ms.dimension_id IN (${dimensionIdList(ids)}) ${mediaTypeClause(args.mediaType)}
    GROUP BY ms.media_type, ms.media_id
    ORDER BY
      CASE WHEN SUM(ms.comparison_count) = 0 THEN 1 ELSE 0 END,
      SUM(ms.score * cd.weight) / SUM(cd.weight) DESC,
      COALESCE(m.title, tv.name) ASC
    LIMIT ${args.limit} OFFSET ${args.offset}
  `);
}

function rowToRanked(
  row: OverallRow,
  index: number,
  offset: number,
  totalActiveDimensions: number
): RankedMediaEntry {
  const counts = row.perDimCounts.split(',').map(Number);
  return {
    rank: offset + index + 1,
    mediaType: row.mediaType,
    mediaId: row.mediaId,
    title: row.title,
    year: row.year,
    posterUrl: resolvePosterUrl(row),
    score: Math.round(row.score * 10) / 10,
    comparisonCount: row.comparisonCount,
    confidence: calculateOverallConfidence(counts, totalActiveDimensions),
  };
}

/** Cross-dimension rankings, weight-blended per the dimensions' `weight`. */
export function getOverallRankings(db: MediaDb, args: OverallRankingsArgs): OverallRankingsResult {
  const activeDimensionIds = getActiveDimensionIds(db);
  if (activeDimensionIds.length === 0) return { rows: [], total: 0 };

  const total = fetchOverallCount(db, activeDimensionIds, args.mediaType);
  const rows = fetchOverallRows(db, activeDimensionIds, args);
  return {
    rows: rows.map((row, i) => rowToRanked(row, i, args.offset, activeDimensionIds.length)),
    total,
  };
}
