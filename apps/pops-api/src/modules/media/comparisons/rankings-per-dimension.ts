import { getDb } from '../../../db.js';
import { resolvePosterUrl, type RankingRowBase } from './rankings-helpers.js';
import { calculateConfidence, type RankedMediaEntry } from './types.js';

export interface PerDimensionRankingsArgs {
  dimensionId: number;
  mediaType: string | undefined;
  limit: number;
  offset: number;
}

export interface PerDimensionRankingsResult {
  rows: RankedMediaEntry[];
  total: number;
}

export function getPerDimensionRankings(
  args: PerDimensionRankingsArgs
): PerDimensionRankingsResult {
  const { dimensionId, mediaType, limit, offset } = args;
  const rawDb = getDb();
  const mediaTypeClause = mediaType ? 'AND ms.media_type = ?' : '';
  const params: unknown[] = [dimensionId];
  if (mediaType) params.push(mediaType);

  const countResult = rawDb
    .prepare(
      `SELECT COUNT(*) as total FROM media_scores ms
       WHERE ms.dimension_id = ? AND ms.excluded = 0 ${mediaTypeClause}`
    )
    .get(...params) as { total: number };

  const rows = rawDb
    .prepare(
      `SELECT
        ms.media_type as mediaType,
        ms.media_id as mediaId,
        ms.score as score,
        ms.comparison_count as comparisonCount,
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
      LEFT JOIN movies m ON ms.media_type = 'movie' AND ms.media_id = m.id
      LEFT JOIN tv_shows tv ON ms.media_type = 'tv_show' AND ms.media_id = tv.id
      WHERE ms.dimension_id = ? AND ms.excluded = 0 ${mediaTypeClause}
      ORDER BY
        CASE WHEN ms.comparison_count = 0 THEN 1 ELSE 0 END,
        ms.score DESC,
        COALESCE(m.title, tv.name) ASC
      LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as RankingRowBase[];

  return {
    rows: rows.map((row, i) => ({
      rank: offset + i + 1,
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      title: row.title,
      year: row.year,
      posterUrl: resolvePosterUrl(row),
      score: Math.round(row.score * 10) / 10,
      comparisonCount: row.comparisonCount,
      confidence: calculateConfidence(row.comparisonCount),
    })),
    total: countResult.total,
  };
}
