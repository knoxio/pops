/**
 * Unit tests for ScopeReconciliationService (see pillars/cerebrum/docs/prds/scope-model).
 */
import { describe, expect, it } from 'vitest';

import { ScopeReconciliationService, segmentSetKey } from './scope-reconciliation.js';

import type { ScopeInfo } from './scopes.js';

function k(scopes: Array<[string, number]>): ScopeInfo[] {
  return scopes.map(([scope, count]) => ({ scope, count }));
}

const svc = new ScopeReconciliationService();

describe('ScopeReconciliationService.reconcile', () => {
  it('returns no suggestions when the input scope is already canonical', () => {
    const out = svc.reconcile({
      suggestedScopes: ['work.karbon.fedx.meetings'],
      knownScopes: k([['work.karbon.fedx.meetings', 12]]),
    });
    expect(out.suggestions).toEqual([]);
  });

  it('proposes the canonical when segments match in different order', () => {
    const out = svc.reconcile({
      suggestedScopes: ['work.karbon.meetings.fedx'],
      knownScopes: k([['work.karbon.fedx.meetings', 12]]),
    });
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0]).toMatchObject({
      original: 'work.karbon.meetings.fedx',
      canonical: 'work.karbon.fedx.meetings',
      confidence: 0.95,
      reason: 'same segments, different order',
    });
  });

  it('proposes a longer canonical when input is a strict subset', () => {
    const out = svc.reconcile({
      suggestedScopes: ['karbon.meetings'],
      knownScopes: k([['work.karbon.fedx.meetings', 12]]),
    });
    expect(out.suggestions[0]).toMatchObject({
      canonical: 'work.karbon.fedx.meetings',
      confidence: 0.85,
      reason: 'matches longer canonical scope',
    });
  });

  it('proposes a shorter canonical when input is a strict superset', () => {
    const out = svc.reconcile({
      suggestedScopes: ['work.karbon.fedx.meetings.daily'],
      knownScopes: k([['work.karbon.fedx.meetings', 30]]),
    });
    expect(out.suggestions[0]).toMatchObject({
      canonical: 'work.karbon.fedx.meetings',
      confidence: 0.7,
      reason: 'matches shorter canonical scope',
    });
  });

  it('detects single-segment typos within Levenshtein 2', () => {
    const out = svc.reconcile({
      suggestedScopes: ['work.karbn.fedx.meetings'],
      knownScopes: k([['work.karbon.fedx.meetings', 5]]),
    });
    expect(out.suggestions[0]).toMatchObject({
      canonical: 'work.karbon.fedx.meetings',
      confidence: 0.8,
      reason: 'likely typo in segment 2',
    });
  });

  it('does not flag typos beyond Levenshtein 2', () => {
    const out = svc.reconcile({
      // 4 edits: karbon → fedex
      suggestedScopes: ['work.fedex.fedx.meetings'],
      knownScopes: k([['work.karbon.fedx.meetings', 5]]),
    });
    expect(out.suggestions).toEqual([]);
  });

  it('does not flag a typo when more than one segment differs', () => {
    const out = svc.reconcile({
      suggestedScopes: ['work.karbn.fed.meetings'],
      knownScopes: k([['work.karbon.fedx.meetings', 5]]),
    });
    expect(out.suggestions).toEqual([]);
  });

  it('prefers the higher-confidence match when multiple types apply', () => {
    // Both `karbon.meetings` (subset → 0.85) and `karbon.work.meetings.fedx`
    // (segment-set → 0.95) compete for `work.karbon.meetings.fedx`. The
    // segment-set match wins.
    const out = svc.reconcile({
      suggestedScopes: ['work.karbon.meetings.fedx'],
      knownScopes: k([
        ['karbon.meetings', 100],
        ['work.karbon.fedx.meetings', 5],
      ]),
    });
    expect(out.suggestions[0]).toMatchObject({
      canonical: 'work.karbon.fedx.meetings',
      confidence: 0.95,
    });
  });

  it('breaks confidence ties by canonical usage count', () => {
    // Both candidates are subset matches (0.85). The higher-count one wins.
    const out = svc.reconcile({
      suggestedScopes: ['karbon.meetings'],
      knownScopes: k([
        ['work.karbon.fedx.meetings', 3],
        ['personal.karbon.meetings.notes', 50],
      ]),
    });
    expect(out.suggestions[0]?.canonical).toBe('personal.karbon.meetings.notes');
  });

  it('ignores known scopes with zero usage count', () => {
    const out = svc.reconcile({
      suggestedScopes: ['karbon.meetings'],
      knownScopes: k([['work.karbon.fedx.meetings', 0]]),
    });
    expect(out.suggestions).toEqual([]);
  });

  it('suppresses suggestions previously dismissed for this engram', () => {
    const out = svc.reconcile({
      suggestedScopes: ['karbon.meetings'],
      knownScopes: k([['work.karbon.fedx.meetings', 10]]),
      dismissedSegmentSetKeys: [segmentSetKey('work.karbon.fedx.meetings')],
    });
    expect(out.suggestions).toEqual([]);
  });

  it('returns no suggestion when the best candidate is below 0.6 confidence', () => {
    // No match types apply — completely unrelated scope.
    const out = svc.reconcile({
      suggestedScopes: ['unrelated.thing'],
      knownScopes: k([['work.karbon.fedx.meetings', 10]]),
    });
    expect(out.suggestions).toEqual([]);
  });

  it('reconciles each suggested scope independently', () => {
    const out = svc.reconcile({
      suggestedScopes: ['karbon.meetings', 'random.scope'],
      knownScopes: k([['work.karbon.fedx.meetings', 10]]),
    });
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0]?.original).toBe('karbon.meetings');
  });

  it('breaks confidence+count ties lexicographically on canonical scope', () => {
    // Both candidates are subset matches (0.85) with identical usage counts.
    // The lexicographically lower canonical wins, regardless of iteration order.
    const out1 = svc.reconcile({
      suggestedScopes: ['karbon.meetings'],
      knownScopes: k([
        ['work.karbon.fedx.meetings', 5],
        ['personal.karbon.notes.meetings', 5],
      ]),
    });
    const out2 = svc.reconcile({
      suggestedScopes: ['karbon.meetings'],
      // Same candidates, reversed input order — must produce the same answer.
      knownScopes: k([
        ['personal.karbon.notes.meetings', 5],
        ['work.karbon.fedx.meetings', 5],
      ]),
    });
    expect(out1.suggestions[0]?.canonical).toBe('personal.karbon.notes.meetings');
    expect(out2.suggestions[0]?.canonical).toBe('personal.karbon.notes.meetings');
  });

  it('reconciles 10,000 known scopes well within budget (perf smoke test)', () => {
    const many: ScopeInfo[] = [];
    for (let i = 0; i < 10_000; i++) {
      many.push({ scope: `work.team-${i}.projects.notes`, count: i + 1 });
    }
    // Warmup to amortise JIT.
    for (let i = 0; i < 3; i++) {
      svc.reconcile({
        suggestedScopes: ['team-7142.projects.notes'],
        knownScopes: many,
      });
    }
    const start = performance.now();
    svc.reconcile({
      suggestedScopes: ['team-7142.projects.notes'],
      knownScopes: many,
    });
    const elapsed = performance.now() - start;
    // Generous ceiling so CI runners under load do not flake; the real target
    // (pillars/cerebrum/docs/prds/scope-model) is far tighter.
    expect(elapsed).toBeLessThan(250);
  });
});

describe('segmentSetKey', () => {
  it('produces the same key for any segment ordering', () => {
    expect(segmentSetKey('work.karbon.fedx.meetings')).toBe(
      segmentSetKey('meetings.fedx.karbon.work')
    );
  });

  it('returns the segment unchanged for a single-segment input', () => {
    expect(segmentSetKey('only')).toBe('only');
  });

  it('joins two segments alphabetically', () => {
    expect(segmentSetKey('b.a')).toBe('a|b');
  });

  it('does not collapse repeated segments', () => {
    // A scope with duplicate segments is degenerate but the key reflects all
    // segments — the dismissal contract is "same segment multiset".
    expect(segmentSetKey('a.b.a')).toBe('a|a|b');
  });
});
