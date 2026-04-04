/**
 * Staleness service — mark, get, and reset staleness for media items.
 *
 * Staleness models how "stale" a comparison score is relative to the user's
 * current preferences. Each mark compounds by ×0.5 (floor 0.01). Watching
 * the media resets staleness to 1.0 (fresh).
 */
import { getDb } from "../../../db.js";

const STALENESS_DECAY = 0.5;
const STALENESS_FLOOR = 0.01;

/**
 * Mark a media item as stale. Inserts with staleness = 0.5 if no row exists,
 * or multiplies existing staleness by 0.5 (floor 0.01).
 */
export function markStale(mediaType: string, mediaId: number): number {
  const db = getDb();

  const existing = db
    .prepare(`SELECT staleness FROM comparison_staleness WHERE media_type = ? AND media_id = ?`)
    .get(mediaType, mediaId) as { staleness: number } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO comparison_staleness (media_type, media_id, staleness, updated_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(mediaType, mediaId, STALENESS_DECAY);
    return STALENESS_DECAY;
  }

  const newStaleness = Math.max(existing.staleness * STALENESS_DECAY, STALENESS_FLOOR);

  db.prepare(
    `UPDATE comparison_staleness SET staleness = ?, updated_at = datetime('now')
     WHERE media_type = ? AND media_id = ?`
  ).run(newStaleness, mediaType, mediaId);

  return newStaleness;
}

/**
 * Get the staleness value for a media item. Returns 1.0 (fresh) if no row.
 */
export function getStaleness(mediaType: string, mediaId: number): number {
  const db = getDb();

  const row = db
    .prepare(`SELECT staleness FROM comparison_staleness WHERE media_type = ? AND media_id = ?`)
    .get(mediaType, mediaId) as { staleness: number } | undefined;

  return row?.staleness ?? 1.0;
}

/**
 * Reset staleness for a media item (delete the row so it defaults to 1.0).
 */
export function resetStaleness(mediaType: string, mediaId: number): void {
  const db = getDb();

  db.prepare(`DELETE FROM comparison_staleness WHERE media_type = ? AND media_id = ?`).run(
    mediaType,
    mediaId
  );
}
