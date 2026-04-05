/**
 * Shelf impressions service — tracks how often each shelf has been shown
 * so that freshness scores can down-rank recently-surfaced shelves.
 */
import { gte, lt, count } from "drizzle-orm";
import { getDrizzle } from "../../../../db.js";
import { shelfImpressions } from "@pops/db-types";

/** Insert impression rows for each shelf ID shown in a session. */
export function recordImpressions(shelfIds: string[]): void {
  if (shelfIds.length === 0) return;
  const db = getDrizzle();
  db.insert(shelfImpressions)
    .values(shelfIds.map((shelfId) => ({ shelfId })))
    .run();
}

/**
 * Returns a map of shelfId → impression count for the last `days` days.
 * Only shelf IDs that have at least one impression are included.
 */
export function getRecentImpressions(days: number): Map<string, number> {
  const db = getDrizzle();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const rows = db
    .select({ shelfId: shelfImpressions.shelfId, impressionCount: count() })
    .from(shelfImpressions)
    .where(gte(shelfImpressions.shownAt, cutoff))
    .groupBy(shelfImpressions.shelfId)
    .all();

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.shelfId, row.impressionCount);
  }
  return map;
}

/**
 * Compute freshness score for a shelf: 1 / (1 + countInLast7Days), floor 0.1.
 * Higher count → lower freshness. Score is always ≥ 0.1.
 */
export function getShelfFreshness(countInLast7Days: number): number {
  return Math.max(0.1, 1 / (1 + countInLast7Days));
}

/**
 * Delete impression rows older than 30 days.
 * Call on module/server startup to keep the table bounded.
 */
export function cleanupOldImpressions(): void {
  const db = getDrizzle();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  db.delete(shelfImpressions).where(lt(shelfImpressions.shownAt, cutoff)).run();
}

/** Initialize: cleanup old impressions. Call once on startup. */
export function initImpressionsService(): void {
  cleanupOldImpressions();
}
