/**
 * Tier override service — set, get, and remove tier overrides for media items.
 *
 * Tier overrides take precedence over ELO-derived tiers in tier list display.
 * Each (mediaType, mediaId, dimensionId) tuple can have at most one override.
 */
import { getDb } from '../../../db.js';

export interface TierOverride {
  id: number;
  mediaType: string;
  mediaId: number;
  dimensionId: number;
  tier: string;
  createdAt: string;
}

/**
 * Set a tier override for a media item in a dimension.
 * Upserts: updates the tier if an override already exists.
 */
export function setTierOverride(
  mediaType: string,
  mediaId: number,
  dimensionId: number,
  tier: string
): TierOverride {
  const db = getDb();

  db.prepare(
    `INSERT INTO tier_overrides (media_type, media_id, dimension_id, tier)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (media_type, media_id, dimension_id)
     DO UPDATE SET tier = excluded.tier, created_at = datetime('now')`
  ).run(mediaType, mediaId, dimensionId, tier);

  const row = db
    .prepare(
      `SELECT id, media_type AS mediaType, media_id AS mediaId,
              dimension_id AS dimensionId, tier, created_at AS createdAt
       FROM tier_overrides
       WHERE media_type = ? AND media_id = ? AND dimension_id = ?`
    )
    .get(mediaType, mediaId, dimensionId) as TierOverride;

  return row;
}

/**
 * Remove a tier override for a media item in a dimension.
 * Returns true if a row was deleted, false if no override existed.
 */
export function removeTierOverride(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): boolean {
  const db = getDb();

  const result = db
    .prepare(
      `DELETE FROM tier_overrides
       WHERE media_type = ? AND media_id = ? AND dimension_id = ?`
    )
    .run(mediaType, mediaId, dimensionId);

  return result.changes > 0;
}

/**
 * Get all tier overrides for a dimension.
 */
export function getTierOverrides(dimensionId: number): TierOverride[] {
  const db = getDb();

  return db
    .prepare(
      `SELECT id, media_type AS mediaType, media_id AS mediaId,
              dimension_id AS dimensionId, tier, created_at AS createdAt
       FROM tier_overrides WHERE dimension_id = ? ORDER BY tier, media_type, media_id`
    )
    .all(dimensionId) as TierOverride[];
}

/**
 * A tier override joined with the placed movie's metadata, ready to render
 * directly on the tier-list board.
 */
export interface TierListPlacement {
  mediaId: number;
  mediaType: 'movie';
  tier: string;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
}

/**
 * Get all tier-list placements for a dimension, joined with the movie's
 * display metadata (title, poster, current score, comparison count).
 *
 * Used by the tier-list page on mount to hydrate the board with previously-
 * submitted placements. Movies that lack a `media_scores` row for the
 * dimension default to score 1500 / 0 comparisons — this can happen when an
 * override is set before any comparison has been recorded for that pair.
 */
export function getTierListPlacementsForDimension(dimensionId: number): TierListPlacement[] {
  const db = getDb();

  return db
    .prepare(
      `SELECT
         tov.media_id        AS mediaId,
         tov.tier            AS tier,
         m.title             AS title,
         m.tmdb_id           AS movieTmdbId,
         m.poster_override_path AS moviePosterOverride,
         COALESCE(ms.score, 1500.0)        AS score,
         COALESCE(ms.comparison_count, 0)  AS comparisonCount
       FROM tier_overrides tov
       JOIN movies m
         ON tov.media_type = 'movie' AND m.id = tov.media_id
       LEFT JOIN media_scores ms
         ON ms.media_type = 'movie'
        AND ms.media_id = tov.media_id
        AND ms.dimension_id = tov.dimension_id
       WHERE tov.dimension_id = ?
         AND tov.media_type = 'movie'
       ORDER BY tov.tier, m.title`
    )
    .all(dimensionId)
    .map((row) => {
      const r = row as {
        mediaId: number;
        tier: string;
        title: string;
        movieTmdbId: number | null;
        moviePosterOverride: string | null;
        score: number;
        comparisonCount: number;
      };
      return {
        mediaId: r.mediaId,
        mediaType: 'movie' as const,
        tier: r.tier,
        title: r.title,
        posterUrl: resolvePosterUrl(r.moviePosterOverride, r.movieTmdbId),
        score: Math.round(r.score * 10) / 10,
        comparisonCount: r.comparisonCount,
      };
    });
}

function resolvePosterUrl(override: string | null, tmdbId: number | null): string | null {
  if (override) return override;
  if (tmdbId) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return null;
}

/**
 * Get the tier override for a specific media item in a dimension, or null.
 */
export function getTierOverrideForMedia(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): TierOverride | null {
  const db = getDb();

  return (
    (db
      .prepare(
        `SELECT id, media_type AS mediaType, media_id AS mediaId,
                dimension_id AS dimensionId, tier, created_at AS createdAt
         FROM tier_overrides
         WHERE media_type = ? AND media_id = ? AND dimension_id = ?`
      )
      .get(mediaType, mediaId, dimensionId) as TierOverride | undefined) ?? null
  );
}
