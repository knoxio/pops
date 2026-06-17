/**
 * Tier overrides — the persisted per-(media, dimension) tier placement that
 * hydrates a tier-list round and survives ELO recalculation. HTTP-free,
 * `(db, …)` arg.
 */
import { and, asc, eq, type SQL, sql } from 'drizzle-orm';

import { tierOverrides } from '../../schema.js';

import type { MediaDb } from '../internal.js';

export interface TierOverride {
  id: number;
  mediaType: string;
  mediaId: number;
  dimensionId: number;
  tier: string;
  createdAt: string;
}

export interface SetTierOverrideInput {
  mediaType: string;
  mediaId: number;
  dimensionId: number;
  tier: string;
}

function whereMedia(mediaType: string, mediaId: number, dimensionId: number): SQL | undefined {
  return and(
    eq(tierOverrides.mediaType, mediaType),
    eq(tierOverrides.mediaId, mediaId),
    eq(tierOverrides.dimensionId, dimensionId)
  );
}

/** Set (upsert) a tier override for a media item on a dimension. */
export function setTierOverride(db: MediaDb, input: SetTierOverrideInput): TierOverride {
  const { mediaType, mediaId, dimensionId, tier } = input;
  db.insert(tierOverrides)
    .values({ mediaType, mediaId, dimensionId, tier })
    .onConflictDoUpdate({
      target: [tierOverrides.mediaType, tierOverrides.mediaId, tierOverrides.dimensionId],
      set: { tier, createdAt: sql`(datetime('now'))` },
    })
    .run();

  const row = db
    .select()
    .from(tierOverrides)
    .where(whereMedia(mediaType, mediaId, dimensionId))
    .get();
  if (!row) throw new Error('Failed to retrieve tier override after upsert');
  return row;
}

/** Remove a tier override. Returns true if a row was deleted. */
export function removeTierOverride(
  db: MediaDb,
  mediaType: string,
  mediaId: number,
  dimensionId: number
): boolean {
  const result = db
    .delete(tierOverrides)
    .where(whereMedia(mediaType, mediaId, dimensionId))
    .run();
  return result.changes > 0;
}

/** All tier overrides for a dimension, ordered by tier then media. */
export function getTierOverrides(db: MediaDb, dimensionId: number): TierOverride[] {
  return db
    .select()
    .from(tierOverrides)
    .where(eq(tierOverrides.dimensionId, dimensionId))
    .orderBy(asc(tierOverrides.tier), asc(tierOverrides.mediaType), asc(tierOverrides.mediaId))
    .all();
}

/** The tier override for a specific media item on a dimension, or null. */
export function getTierOverrideForMedia(
  db: MediaDb,
  mediaType: string,
  mediaId: number,
  dimensionId: number
): TierOverride | null {
  return (
    db
      .select()
      .from(tierOverrides)
      .where(whereMedia(mediaType, mediaId, dimensionId))
      .get() ?? null
  );
}
