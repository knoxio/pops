/**
 * Tier list derivation — maps ELO scores to S/A/B/C/D/F tiers by percentile.
 */
import { getDb } from "../../../db.js";
import { resolvePosterUrl } from "./service.js";

export const TIERS = ["S", "A", "B", "C", "D", "F"] as const;
export type Tier = (typeof TIERS)[number];

/** Cumulative percentile breakpoints for each tier (top → bottom). */
const TIER_BREAKPOINTS: Array<{ tier: Tier; cumulativePercent: number }> = [
  { tier: "S", cumulativePercent: 0.1 },
  { tier: "A", cumulativePercent: 0.25 },
  { tier: "B", cumulativePercent: 0.5 },
  { tier: "C", cumulativePercent: 0.75 },
  { tier: "D", cumulativePercent: 0.9 },
  { tier: "F", cumulativePercent: 1.0 },
];

export interface TierMovie {
  mediaType: string;
  mediaId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
}

export interface TierGroup {
  tier: Tier;
  movies: TierMovie[];
}

function assignTier(index: number, total: number): Tier {
  if (total <= 1) return "S";
  const percentile = index / (total - 1);
  for (const bp of TIER_BREAKPOINTS) {
    if (percentile <= bp.cumulativePercent) return bp.tier;
  }
  return "F";
}

export function deriveTierList(dimensionId: number): TierGroup[] {
  const rawDb = getDb();

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
      WHERE ms.dimension_id = ? AND ms.excluded = 0 AND ms.comparison_count > 0
      ORDER BY ms.score DESC, COALESCE(m.title, tv.name) ASC`
    )
    .all(dimensionId) as Array<{
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

  if (rows.length === 0) return [];

  const tierMap: Record<Tier, TierMovie[]> = { S: [], A: [], B: [], C: [], D: [], F: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const tier = assignTier(i, rows.length);
    tierMap[tier].push({
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      title: row.title,
      year: row.year,
      posterUrl: resolvePosterUrl(row),
      score: Math.round(row.score * 10) / 10,
      comparisonCount: row.comparisonCount,
    });
  }

  return TIERS.map((tier) => ({
    tier,
    movies: tierMap[tier],
  })).filter((group) => group.movies.length > 0);
}
