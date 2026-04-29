/**
 * Citation tracking for engrams (PRD-084 #2242).
 *
 * Tracks how many times engrams are cited in query responses. Cited engrams
 * are considered less stale — citation count is used as a factor in
 * staleness scoring.
 *
 * This module is intentionally DB-free so it can be imported by staleness
 * detection without dragging in drizzle/db-types. For DB flush operations
 * see citation-flush.ts.
 */

/** In-memory citation counter. Used as a lightweight cache between DB flushes. */
const citationCounts = new Map<string, number>();

/** Record a citation event for an engram (called from query pipeline). */
export function recordCitation(engramId: string): void {
  const current = citationCounts.get(engramId) ?? 0;
  citationCounts.set(engramId, current + 1);
}

/** Record citations for multiple engrams at once. */
export function recordCitations(engramIds: string[]): void {
  for (const id of engramIds) {
    recordCitation(id);
  }
}

/** Get the citation count for an engram. */
export function getCitationCount(engramId: string): number {
  return citationCounts.get(engramId) ?? 0;
}

/** Get all citation counts (for use in staleness detection). */
export function getAllCitationCounts(): ReadonlyMap<string, number> {
  return citationCounts;
}

/** Reset all citation counts (useful for testing). */
export function resetCitationCounts(): void {
  citationCounts.clear();
}

/**
 * Compute a staleness reduction factor based on citation count.
 * Returns a multiplier between 0.5 and 1.0:
 *   0 citations → 1.0 (no reduction)
 *   1-2 citations → 0.8 (20% less stale)
 *   3-5 citations → 0.7 (30% less stale)
 *   6+ citations → 0.5 (50% less stale)
 */
export function citationStalenessMultiplier(citationCount: number): number {
  if (citationCount <= 0) return 1.0;
  if (citationCount <= 2) return 0.8;
  if (citationCount <= 5) return 0.7;
  return 0.5;
}

/** Apply citation-aware staleness threshold adjustment. */
export function adjustedStalenessDays(baseDays: number, engramId: string): number {
  const count = getCitationCount(engramId);
  const multiplier = citationStalenessMultiplier(count);
  // Invert: more citations → higher effective threshold (harder to be stale)
  return Math.round(baseDays / multiplier);
}
