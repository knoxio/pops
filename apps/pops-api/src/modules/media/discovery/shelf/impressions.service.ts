/**
 * Shelf impressions wrapper — resolves the singleton drizzle handle and
 * forwards to `@pops/media-db`'s service layer (pillar media phase 1 PR 3).
 *
 * pops-api callers (router-shelf, session.service, discovery tests) keep
 * importing from this file unchanged. The cutover happens here in one place;
 * the next slice of Phase 1 splits these forwards across additional pillar
 * services or PR 4 deletes this file once every caller flips to importing
 * `@pops/media-db` directly.
 */
import { shelfImpressionsService } from '@pops/media-db';

import { getDrizzle } from '../../../../db.js';

/** Insert one impression row per shelf id shown in a session.
 *
 * Short-circuits on empty input so a no-op call doesn't pay the cost of
 * resolving the singleton drizzle handle (which lazily opens + configures
 * the SQLite connection the first time it's called).
 */
export function recordImpressions(shelfIds: string[]): void {
  if (shelfIds.length === 0) return;
  shelfImpressionsService.recordImpressions(getDrizzle(), shelfIds);
}

/** Map of `shelfId → impressionCount` for the last `days` days. */
export function getRecentImpressions(days: number): Map<string, number> {
  return shelfImpressionsService.getRecentImpressions(getDrizzle(), days);
}

/** Freshness multiplier — pure function; no DB handle required. */
export function getShelfFreshness(countInLast7Days: number): number {
  return shelfImpressionsService.getShelfFreshness(countInLast7Days);
}

/** Delete impression rows older than the retention window. */
export function cleanupOldImpressions(): void {
  shelfImpressionsService.cleanupOldImpressions(getDrizzle());
}

/** Init hook — runs cleanup once at module/server startup. */
export function initImpressionsService(): void {
  shelfImpressionsService.initImpressionsService(getDrizzle());
}
