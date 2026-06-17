/**
 * Citation tracking for engrams (PRD-084).
 *
 * Tracks how many times engrams are cited in query responses. Cited engrams
 * are considered less stale — citation count adjusts the per-engram staleness
 * threshold. This module is intentionally DB-free so it can be imported by
 * staleness detection without dragging in drizzle/db types.
 *
 * Pillar delta: the monolith persists citations through a flush step
 * (`citation-flush.ts`). The pillar's query pipeline does not yet record
 * citations into this counter, so in practice this returns the unadjusted base
 * threshold today; the seam is kept so the wiring lands cleanly later.
 */

const citationCounts = new Map<string, number>();

/** Record a citation event for an engram. */
export function recordCitation(engramId: string): void {
  citationCounts.set(engramId, (citationCounts.get(engramId) ?? 0) + 1);
}

/** Get the citation count for an engram. */
export function getCitationCount(engramId: string): number {
  return citationCounts.get(engramId) ?? 0;
}

/** Reset all citation counts (test helper). */
export function resetCitationCounts(): void {
  citationCounts.clear();
}

/**
 * Staleness reduction multiplier based on citation count.
 *   0 citations   → 1.0 (no reduction)
 *   1-2 citations → 0.8
 *   3-5 citations → 0.7
 *   6+ citations  → 0.5
 */
export function citationStalenessMultiplier(citationCount: number): number {
  if (citationCount <= 0) return 1.0;
  if (citationCount <= 2) return 0.8;
  if (citationCount <= 5) return 0.7;
  return 0.5;
}

/** Apply citation-aware staleness threshold adjustment (more citations → less stale). */
export function adjustedStalenessDays(baseDays: number, engramId: string): number {
  const multiplier = citationStalenessMultiplier(getCitationCount(engramId));
  return Math.round(baseDays / multiplier);
}
