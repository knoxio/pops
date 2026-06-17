/**
 * Rankings entry point — per-dimension and overall ranked lists. Raw SQL via
 * drizzle's `db.all` so the poster joins + uncertainty ordering stay one query.
 */
import { sql, type SQL } from 'drizzle-orm';

import { calculateConfidence, type RankedMediaEntry } from './mappers.js';
import { resolvePosterUrl, type RankingRowBase } from './rankings-helpers.js';
import { getOverallRankings } from './rankings-overall.js';

import type { MediaDb } from '../internal.js';

export { resolvePosterUrl } from './rankings-helpers.js';

export interface RankingsResult {
  rows: RankedMediaEntry[];
  total: number;
}

interface PerDimensionArgs {
  dimensionId: number;
  mediaType: string | undefined;
  limit: number;
  offset: number;
}

function mediaTypeClause(mediaType: string | undefined): SQL {
  return mediaType ? sql`AND ms.media_type = ${mediaType}` : sql``;
}

function getPerDimensionRankings(db: MediaDb, args: PerDimensionArgs): RankingsResult {
  const { dimensionId, mediaType, limit, offset } = args;
  const typeClause = mediaTypeClause(mediaType);

  const countRows = db.all<{ total: number }>(sql`
    SELECT COUNT(*) AS total FROM media_scores ms
    WHERE ms.dimension_id = ${dimensionId} AND ms.excluded = 0 ${typeClause}
  `);

  const rows = db.all<RankingRowBase>(sql`
    SELECT
      ms.media_type AS mediaType,
      ms.media_id AS mediaId,
      ms.score AS score,
      ms.comparison_count AS comparisonCount,
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
    LEFT JOIN movies m ON ms.media_type = 'movie' AND ms.media_id = m.id
    LEFT JOIN tv_shows tv ON ms.media_type = 'tv_show' AND ms.media_id = tv.id
    WHERE ms.dimension_id = ${dimensionId} AND ms.excluded = 0 ${typeClause}
    ORDER BY
      CASE WHEN ms.comparison_count = 0 THEN 1 ELSE 0 END,
      ms.score DESC,
      COALESCE(m.title, tv.name) ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

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
    total: countRows[0]?.total ?? 0,
  };
}

export interface RankingsInput {
  dimensionId?: number | undefined;
  mediaType?: string | undefined;
  limit: number;
  offset: number;
}

/** Ranked media by ELO — per-dimension when `dimensionId` is set, else overall. */
export function getRankings(db: MediaDb, input: RankingsInput): RankingsResult {
  const { dimensionId, mediaType, limit, offset } = input;
  if (dimensionId !== undefined) {
    return getPerDimensionRankings(db, { dimensionId, mediaType, limit, offset });
  }
  return getOverallRankings(db, { mediaType, limit, offset });
}
