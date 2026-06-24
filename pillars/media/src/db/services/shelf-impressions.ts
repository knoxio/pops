/**
 * Shelf impressions service — tracks how often each shelf has been shown so
 * that freshness scores can down-rank recently-surfaced shelves.
 */
import { count, gte, lt } from 'drizzle-orm';

import { shelfImpressions } from '../schema.js';

import type { MediaDb } from './internal.js';

const RECENT_WINDOW_DAYS_DEFAULT = 7;
const RETENTION_DAYS = 30;
const FRESHNESS_FLOOR = 0.1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * SQLite's `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` (space-delimited,
 * second precision). Match that format when comparing against `shown_at`
 * values that were written by the table default expression.
 */
function sqliteTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/** Insert one impression row per shelf id shown in a session. No-op on empty input. */
export function recordImpressions(db: MediaDb, shelfIds: string[]): void {
  if (shelfIds.length === 0) return;
  db.insert(shelfImpressions)
    .values(shelfIds.map((shelfId) => ({ shelfId })))
    .run();
}

/**
 * Map of `shelfId → impressionCount` for the last `days` days. Only shelf
 * ids with at least one impression in the window are included.
 */
export function getRecentImpressions(
  db: MediaDb,
  days: number = RECENT_WINDOW_DAYS_DEFAULT
): Map<string, number> {
  const cutoff = sqliteTimestamp(new Date(Date.now() - days * MS_PER_DAY));
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
 * Freshness multiplier for a shelf: `1 / (1 + countInLastWindow)`, floored
 * at {@link FRESHNESS_FLOOR}. Higher impression counts produce lower scores;
 * the score never decays past the floor so a shelf can't be permanently
 * suppressed by historical over-exposure.
 *
 * Pure function — kept here so callers can compute scores without a DB
 * handle, and so the formula has a single source of truth.
 */
export function getShelfFreshness(countInLastWindow: number): number {
  return Math.max(FRESHNESS_FLOOR, 1 / (1 + countInLastWindow));
}

/** Delete impression rows older than the retention window. */
export function cleanupOldImpressions(db: MediaDb): void {
  const cutoff = sqliteTimestamp(new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY));
  db.delete(shelfImpressions).where(lt(shelfImpressions.shownAt, cutoff)).run();
}

/** Init hook — runs {@link cleanupOldImpressions} once at module/server startup. */
export function initImpressionsService(db: MediaDb): void {
  cleanupOldImpressions(db);
}
