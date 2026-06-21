/**
 * Pure helpers for EnrichmentChips (PRD-081 US-07).
 *
 * Extracted so the React component can stay under the line limits and so the
 * algorithmic bits (polling cadence, scope mutations, suggestion key) can be
 * tested directly without rendering.
 */

const FAST_POLL_MS = 1000;
const FAST_POLL_DURATION_MS = 10_000;
const SLOW_POLL_MS = 5000;
const SLOW_POLL_DURATION_MS = 30_000;

/** Polling cadence: fast for the first 10 s, slower for 30 s, then stop. */
export function refetchInterval(elapsedMs: number, enriched: boolean): number | false {
  if (enriched) return false;
  if (elapsedMs < FAST_POLL_DURATION_MS) return FAST_POLL_MS;
  if (elapsedMs < FAST_POLL_DURATION_MS + SLOW_POLL_DURATION_MS) return SLOW_POLL_MS;
  return false;
}

export function hasStoppedPolling(elapsedMs: number, enriched: boolean): boolean {
  if (enriched) return false;
  return elapsedMs >= FAST_POLL_DURATION_MS + SLOW_POLL_DURATION_MS;
}

/** Replace one scope with another; deduplicate when the canonical already exists. */
export function replaceScope(scopes: string[], original: string, canonical: string): string[] {
  const next = scopes.map((s) => (s === original ? canonical : s));
  return [...new Set(next)];
}

/** Sorted-segments key — same as the server-side dismissal contract. */
export function segmentSetKey(scope: string): string {
  return scope.split('.').toSorted().join('|');
}

/** Append `value` to `list` if it's not already present. */
export function appendUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}
