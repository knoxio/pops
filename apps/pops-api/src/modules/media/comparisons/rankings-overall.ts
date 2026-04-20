import { eq } from 'drizzle-orm';

import { comparisonDimensions } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../db.js';
import { resolvePosterUrl, type RankingRowBase } from './rankings-helpers.js';
import { calculateOverallConfidence, type RankedMediaEntry } from './types.js';

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

function getActiveDimensionIds(): number[] {
  const drizzleDb = getDrizzle();
  return drizzleDb
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all()
    .map((r) => r.id);
}

interface FilterContext {
  placeholders: string;
  params: unknown[];
  mediaTypeClause: string;
  totalActiveDimensions: number;
}

function buildFilterContext(
  activeDimensionIds: number[],
  mediaType: string | undefined
): FilterContext {
  const placeholders = activeDimensionIds.map(() => '?').join(',');
  const params: unknown[] = mediaType
    ? [...activeDimensionIds, mediaType]
    : [...activeDimensionIds];
  return {
    placeholders,
    params,
    mediaTypeClause: mediaType ? 'AND ms.media_type = ?' : '',
    totalActiveDimensions: activeDimensionIds.length,
  };
}

function fetchOverallCount(ctx: FilterContext): number {
  const rawDb = getDb();
  const result = rawDb
    .prepare(
      `SELECT COUNT(*) as total FROM (
        SELECT ms.media_type, ms.media_id
        FROM media_scores ms
        JOIN comparison_dimensions cd ON ms.dimension_id = cd.id
        WHERE cd.active = 1 AND ms.excluded = 0 AND ms.dimension_id IN (${ctx.placeholders}) ${ctx.mediaTypeClause}
        GROUP BY ms.media_type, ms.media_id
      )`
    )
    .get(...ctx.params) as { total: number };
  return result.total;
}

function fetchOverallRows(ctx: FilterContext, limit: number, offset: number): OverallRow[] {
  const rawDb = getDb();
  return rawDb
    .prepare(
      `SELECT
        ms.media_type as mediaType,
        ms.media_id as mediaId,
        SUM(ms.score * cd.weight) / SUM(cd.weight) as score,
        SUM(ms.comparison_count) as comparisonCount,
        GROUP_CONCAT(ms.comparison_count) as perDimCounts,
        COALESCE(m.title, tv.name, 'Unknown') as title,
        CASE
          WHEN ms.media_type = 'movie' THEN CAST(SUBSTR(m.release_date, 1, 4) AS INTEGER)
          ELSE CAST(SUBSTR(tv.first_air_date, 1, 4) AS INTEGER)
        END as year,
        m.poster_path as moviePosterPath,
        m.tmdb_id as movieTmdbId,
        m.poster_override_path as moviePosterOverride,
        tv.poster_path as tvPosterPath,
        tv.tvdb_id as tvTvdbId,
        tv.poster_override_path as tvPosterOverride
      FROM media_scores ms
      JOIN comparison_dimensions cd ON ms.dimension_id = cd.id
      LEFT JOIN movies m ON ms.media_type = 'movie' AND ms.media_id = m.id
      LEFT JOIN tv_shows tv ON ms.media_type = 'tv_show' AND ms.media_id = tv.id
      WHERE cd.active = 1 AND ms.excluded = 0 AND ms.dimension_id IN (${ctx.placeholders}) ${ctx.mediaTypeClause}
      GROUP BY ms.media_type, ms.media_id
      ORDER BY
        CASE WHEN SUM(ms.comparison_count) = 0 THEN 1 ELSE 0 END,
        SUM(ms.score * cd.weight) / SUM(cd.weight) DESC,
        COALESCE(m.title, tv.name) ASC
      LIMIT ? OFFSET ?`
    )
    .all(...ctx.params, limit, offset) as OverallRow[];
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

export function getOverallRankings(args: OverallRankingsArgs): OverallRankingsResult {
  const { mediaType, limit, offset } = args;
  const activeDimensionIds = getActiveDimensionIds();
  if (activeDimensionIds.length === 0) {
    return { rows: [], total: 0 };
  }
  const ctx = buildFilterContext(activeDimensionIds, mediaType);
  const total = fetchOverallCount(ctx);
  const rows = fetchOverallRows(ctx, limit, offset);
  return {
    rows: rows.map((row, i) => rowToRanked(row, i, offset, ctx.totalActiveDimensions)),
    total,
  };
}
