/**
 * Tier override service — set, get, and remove tier overrides for media items.
 *
 * Tier overrides take precedence over ELO-derived tiers in tier list display.
 * Each (mediaType, mediaId, dimensionId) tuple can have at most one override.
 */
import { getDb } from "../../../db.js";

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
