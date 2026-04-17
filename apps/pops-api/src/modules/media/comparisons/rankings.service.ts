import { eq } from 'drizzle-orm';

import { comparisonDimensions } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../db.js';
import { calculateConfidence, calculateOverallConfidence, type RankedMediaEntry } from './types.js';

export interface RankingsResult {
  rows: RankedMediaEntry[];
  total: number;
}

/** Resolve the best poster URL from a rankings row. */
export function resolvePosterUrl(row: {
  mediaType: string;
  moviePosterPath: string | null;
  movieTmdbId: number | null;
  moviePosterOverride: string | null;
  tvPosterPath: string | null;
  tvTvdbId: number | null;
  tvPosterOverride: string | null;
}): string | null {
  if (row.mediaType === 'movie') {
    if (row.moviePosterOverride) return row.moviePosterOverride;
    // Always generate the URL when tmdbId is available — the images endpoint
    // handles the case where poster_path is null by fetching from TMDB on demand.
    if (row.movieTmdbId) return `/media/images/movie/${row.movieTmdbId}/poster.jpg`;
    return null;
  }
  if (row.tvPosterOverride) return row.tvPosterOverride;
  if (row.tvPosterPath && row.tvTvdbId) return `/media/images/tv/${row.tvTvdbId}/poster.jpg`;
  return null;
}

export function getRankings(
  dimensionId: number | undefined,
  mediaType: string | undefined,
  limit: number,
  offset: number
): RankingsResult {
  const rawDb = getDb();

  if (dimensionId) {
    // Per-dimension ranking — JOIN movies/tv_shows for title tie-breaking
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
      .all(...params, limit, offset) as Array<{
      mediaType: string;
      mediaId: number;
      score: number;
      comparisonCount: number;
      title: string;
      year: number | null;
      moviePosterPath: string | null;
      movieTmdbId: number | null;
      moviePosterOverride: string | null;
      tvPosterPath: string | null;
      tvTvdbId: number | null;
      tvPosterOverride: string | null;
    }>;

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

  // Overall ranking — average score across all active dimensions
  const drizzleDb = getDrizzle();
  const activeDimensionIds = drizzleDb
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all()
    .map((r) => r.id);

  if (activeDimensionIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const dimensionPlaceholders = activeDimensionIds.map(() => '?').join(',');
  const baseParams: unknown[] = [...activeDimensionIds];

  const mediaTypeClause = mediaType ? 'AND ms.media_type = ?' : '';
  const filterParams: unknown[] = mediaType ? [...baseParams, mediaType] : [...baseParams];

  const countResult = rawDb
    .prepare(
      `SELECT COUNT(*) as total FROM (
        SELECT ms.media_type, ms.media_id
        FROM media_scores ms
        JOIN comparison_dimensions cd ON ms.dimension_id = cd.id
        WHERE cd.active = 1 AND ms.excluded = 0 AND ms.dimension_id IN (${dimensionPlaceholders}) ${mediaTypeClause}
        GROUP BY ms.media_type, ms.media_id
      )`
    )
    .get(...filterParams) as { total: number };

  const totalActiveDimensions = activeDimensionIds.length;

  const rows = rawDb
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
      WHERE cd.active = 1 AND ms.excluded = 0 AND ms.dimension_id IN (${dimensionPlaceholders}) ${mediaTypeClause}
      GROUP BY ms.media_type, ms.media_id
      ORDER BY
        CASE WHEN SUM(ms.comparison_count) = 0 THEN 1 ELSE 0 END,
        SUM(ms.score * cd.weight) / SUM(cd.weight) DESC,
        COALESCE(m.title, tv.name) ASC
      LIMIT ? OFFSET ?`
    )
    .all(...filterParams, limit, offset) as Array<{
    mediaType: string;
    mediaId: number;
    score: number;
    comparisonCount: number;
    perDimCounts: string;
    title: string;
    year: number | null;
    moviePosterPath: string | null;
    movieTmdbId: number | null;
    moviePosterOverride: string | null;
    tvPosterPath: string | null;
    tvTvdbId: number | null;
    tvPosterOverride: string | null;
  }>;

  return {
    rows: rows.map((row, i) => {
      const counts = row.perDimCounts.split(',').map(Number);
      return {
        rank: offset + i + 1,
        mediaType: row.mediaType,
        mediaId: row.mediaId,
        title: row.title,
        year: row.year,
        posterUrl: resolvePosterUrl(row),
        score: Math.round(row.score * 10) / 10,
        comparisonCount: row.comparisonCount,
        confidence: calculateOverallConfidence(counts, totalActiveDimensions),
      };
    }),
    total: countResult.total,
  };
}
