/**
 * Pair generation for the contradiction pass of the PatternDetector
 * (PRD-084 US-03, #2580).
 *
 * Extracted from `pattern-helpers.ts` to keep both files under the
 * `max-lines` lint rule. Build-up is straightforward O(n^2) over engrams
 * filtered by shared top-level scope + at least one shared tag.
 */
import type { EngramSummary } from '../types.js';

/** A candidate engram pair for contradiction analysis. */
export interface ContradictionPair {
  a: EngramSummary;
  b: EngramSummary;
  sharedTag: string;
  /** Number of tags shared between a and b. Used for ranking. */
  overlap: number;
}

function topLevelScope(scope: string): string {
  return scope.split('.')[0] ?? scope;
}

function sharedTopLevel(a: EngramSummary, b: EngramSummary): boolean {
  const aTops = new Set(a.scopes.map(topLevelScope));
  return b.scopes.some((s) => aTops.has(topLevelScope(s)));
}

/**
 * Compute the set of tags shared between two engrams.
 *
 * Both sides are de-duplicated before intersection so an engram with
 * repeated tag values (e.g. `['topic:x', 'topic:x']`) does not inflate
 * the overlap count and unfairly outrank pairs with genuinely broader
 * topical overlap.
 */
function sharedTagList(a: EngramSummary, b: EngramSummary): string[] {
  const aSet = new Set(a.tags);
  const bSet = new Set(b.tags);
  const shared: string[] = [];
  for (const tag of bSet) {
    if (aSet.has(tag)) shared.push(tag);
  }
  return shared;
}

/**
 * Build candidate engram pairs for contradiction analysis.
 *
 * Pairs are eligible when they:
 *   1. Share at least one tag (high topical overlap proxy).
 *   2. Share at least one top-level scope (avoids work/personal crosstalk).
 *   3. Are distinct engrams.
 *
 * Returned pairs are sorted by tag overlap descending so callers can take
 * a prefix when capping LLM spend. Pair ordering is deterministic — engram
 * IDs are sorted before pairing so the same pair is never enqueued twice.
 */
export function buildContradictionPairs(engrams: EngramSummary[]): ContradictionPair[] {
  const sorted = [...engrams].toSorted((a, b) => a.id.localeCompare(b.id));
  const pairs: ContradictionPair[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!a || !b) continue;
      if (!sharedTopLevel(a, b)) continue;

      const tags = sharedTagList(a, b);
      if (tags.length === 0) continue;

      const sharedTag = tags.toSorted()[0];
      if (!sharedTag) continue;

      pairs.push({ a, b, sharedTag, overlap: tags.length });
    }
  }

  return pairs.toSorted((p, q) => q.overlap - p.overlap);
}
