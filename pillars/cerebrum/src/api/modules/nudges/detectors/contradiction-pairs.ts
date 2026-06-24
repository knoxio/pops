/**
 * Pair generation for the contradiction pass of the PatternDetector.
 * O(n^2) build over engrams filtered by shared top-level
 * scope + at least one shared tag, sorted by tag overlap descending so callers
 * can take a prefix when capping LLM spend.
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
 * Build candidate engram pairs for contradiction analysis. Eligible pairs
 * share at least one tag and one top-level scope and are distinct engrams.
 * Engram IDs are sorted before pairing so the same pair is never enqueued
 * twice; the result is sorted by tag overlap descending.
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
