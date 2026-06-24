/**
 * ScopeReconciliationService — propose canonical scopes for user-typed
 * suggestions (see pillars/cerebrum/docs/prds/scope-model).
 *
 * Pure lexical/structural matching against the existing scope vocabulary.
 * No LLM calls, no I/O.
 *
 * Match types, ranked by confidence:
 *   - 0.95  segment-set     same segments, different order
 *   - 0.85  subset           user's segments ⊂ canonical's segments
 *   - 0.80  segment-typo     identical layout, single segment Levenshtein ≤ 2
 *   - 0.70  shallower        canonical's segments ⊂ user's segments (canonical
 *                            shorter and more used)
 *
 * Suggestions are not produced when the user's scope is already an exact
 * canonical match, when no candidate clears 0.6 confidence, or when a prior
 * dismissal for the same segment-set has been recorded on the engram.
 */
import type { ScopeInfo } from './scopes.js';

const MIN_CONFIDENCE = 0.6;
const MAX_TYPO_DISTANCE = 2;

export interface ScopeSuggestion {
  original: string;
  canonical: string;
  confidence: number;
  reason: string;
}

export interface ScopeReconcileInput {
  /** Scopes typed by the user (already validated against the scope schema). */
  suggestedScopes: string[];
  /** Known scopes from the index, with usage counts for tie-breaking. */
  knownScopes: ScopeInfo[];
  /**
   * Segment-set keys (sorted segments joined by `|`) of canonical scopes the
   * user has previously dismissed for this engram. Suppresses re-proposal.
   */
  dismissedSegmentSetKeys?: readonly string[];
}

export interface ScopeReconcileOutput {
  suggestions: ScopeSuggestion[];
}

interface CandidateMatch {
  canonical: string;
  confidence: number;
  reason: string;
  /** Usage count of the canonical scope — secondary ranking signal. */
  count: number;
}

export class ScopeReconciliationService {
  reconcile(input: ScopeReconcileInput): ScopeReconcileOutput {
    const dismissed = new Set(input.dismissedSegmentSetKeys ?? []);
    const knownByScope = new Map<string, number>(input.knownScopes.map((k) => [k.scope, k.count]));

    const suggestions: ScopeSuggestion[] = [];
    for (const original of input.suggestedScopes) {
      // Already canonical — no proposal needed.
      if (knownByScope.has(original)) continue;

      const best = pickBestCandidate(original, input.knownScopes);
      if (!best) continue;
      if (best.confidence < MIN_CONFIDENCE) continue;
      if (dismissed.has(segmentSetKey(best.canonical))) continue;

      suggestions.push({
        original,
        canonical: best.canonical,
        confidence: best.confidence,
        reason: best.reason,
      });
    }
    return { suggestions };
  }
}

/** Compute the dismissal key for a scope: sorted segments joined by `|`. */
export function segmentSetKey(scope: string): string {
  return scope.split('.').toSorted().join('|');
}

function pickBestCandidate(original: string, knownScopes: ScopeInfo[]): CandidateMatch | null {
  const originalSegs = original.split('.');
  const originalSegSet = new Set(originalSegs);

  let best: CandidateMatch | null = null;

  for (const known of knownScopes) {
    if (known.scope === original) continue; // exact match — handled by caller
    if (known.count <= 0) continue; // unused scopes are not vocabulary

    const candidate = scoreCandidate(originalSegs, originalSegSet, known);
    if (!candidate) continue;

    best = pickHigherConfidence(best, candidate);
  }

  return best;
}

function pickHigherConfidence(
  current: CandidateMatch | null,
  next: CandidateMatch
): CandidateMatch {
  if (!current) return next;
  if (next.confidence > current.confidence) return next;
  if (next.confidence < current.confidence) return current;
  // Tie on confidence — break by canonical usage count (higher wins).
  if (next.count > current.count) return next;
  if (next.count < current.count) return current;
  // Still tied — break lexicographically on canonical scope so the result
  // is deterministic regardless of `knownScopes` iteration order.
  return next.canonical < current.canonical ? next : current;
}

function scoreCandidate(
  originalSegs: string[],
  originalSegSet: Set<string>,
  known: ScopeInfo
): CandidateMatch | null {
  const knownSegs = known.scope.split('.');
  const knownSegSet = new Set(knownSegs);

  // Same segments, different order (or same order — order-only differences).
  if (originalSegs.length === knownSegs.length && setEquals(originalSegSet, knownSegSet)) {
    return {
      canonical: known.scope,
      confidence: 0.95,
      reason: 'same segments, different order',
      count: known.count,
    };
  }

  // Same layout, single segment differs by Levenshtein ≤ 2 (typo).
  if (originalSegs.length === knownSegs.length) {
    const typoMatch = isSingleSegmentTypo(originalSegs, knownSegs);
    if (typoMatch !== null) {
      return {
        canonical: known.scope,
        confidence: 0.8,
        reason: `likely typo in segment ${typoMatch + 1}`,
        count: known.count,
      };
    }
  }

  // User's segments ⊂ canonical's segments — canonical is more specific.
  if (originalSegs.length < knownSegs.length && isSubset(originalSegSet, knownSegSet)) {
    return {
      canonical: known.scope,
      confidence: 0.85,
      reason: 'matches longer canonical scope',
      count: known.count,
    };
  }

  // Canonical's segments ⊂ user's segments — canonical is broader and more used.
  if (knownSegs.length < originalSegs.length && isSubset(knownSegSet, originalSegSet)) {
    return {
      canonical: known.scope,
      confidence: 0.7,
      reason: 'matches shorter canonical scope',
      count: known.count,
    };
  }

  return null;
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size >= b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * If `a` and `b` differ in exactly one segment with Levenshtein distance
 * within `MAX_TYPO_DISTANCE`, return the index of the differing segment.
 * Otherwise return null. Assumes the two arrays have the same length.
 */
function isSingleSegmentTypo(a: string[], b: string[]): number | null {
  let differingIndex = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (differingIndex !== -1) return null; // more than one differing segment
    differingIndex = i;
  }
  if (differingIndex === -1) return null; // arrays identical
  const aSeg = a[differingIndex];
  const bSeg = b[differingIndex];
  if (aSeg === undefined || bSeg === undefined) return null;
  const distance = levenshtein(aSeg, bSeg);
  return distance > 0 && distance <= MAX_TYPO_DISTANCE ? differingIndex : null;
}

/** Standard Levenshtein distance with O(min(m,n)) memory. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure b is the shorter — minimises memory.
  let s = a;
  let t = b;
  if (s.length < t.length) {
    const swap = s;
    s = t;
    t = swap;
  }

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  let curr = Array.from<number>({ length: t.length + 1 }).fill(0);

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[t.length] ?? 0;
}

/** Convenience factory — handy for mocking and dependency injection. */
export function createScopeReconciliationService(): ScopeReconciliationService {
  return new ScopeReconciliationService();
}
