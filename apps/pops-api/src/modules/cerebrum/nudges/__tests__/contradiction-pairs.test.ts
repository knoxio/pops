/**
 * Tests for the contradiction pair-builder (PRD-084 US-03, #2580).
 *
 * The pair builder is responsible for ranking — pairs with broader topical
 * overlap should sort first. If shared-tag computation does not dedupe,
 * an engram authored with a repeated tag could outrank pairs with
 * genuinely broader overlap.
 */
import { describe, expect, it } from 'vitest';

import { buildContradictionPairs } from '../detectors/contradiction-pairs.js';

import type { EngramSummary } from '../types.js';

function makeEngram(id: string, overrides: Partial<EngramSummary> = {}): EngramSummary {
  return {
    id,
    type: overrides.type ?? 'note',
    title: overrides.title ?? `Engram ${id}`,
    scopes: overrides.scopes ?? ['work.projects'],
    tags: overrides.tags ?? ['general'],
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? '2026-04-01T10:00:00Z',
    modifiedAt: overrides.modifiedAt ?? '2026-04-15T10:00:00Z',
  };
}

describe('buildContradictionPairs', () => {
  it('produces pairs when engrams share at least one tag and a top-level scope', () => {
    const a = makeEngram('a', { tags: ['topic:x'] });
    const b = makeEngram('b', { tags: ['topic:x'] });
    const pairs = buildContradictionPairs([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.overlap).toBe(1);
    expect(pairs[0]?.sharedTag).toBe('topic:x');
  });

  it('skips pairs without a shared top-level scope', () => {
    const a = makeEngram('a', { scopes: ['work.projects'], tags: ['topic:x'] });
    const b = makeEngram('b', { scopes: ['personal.notes'], tags: ['topic:x'] });
    expect(buildContradictionPairs([a, b])).toHaveLength(0);
  });

  it('skips pairs without any shared tag', () => {
    const a = makeEngram('a', { tags: ['topic:x'] });
    const b = makeEngram('b', { tags: ['topic:y'] });
    expect(buildContradictionPairs([a, b])).toHaveLength(0);
  });

  it('dedupes repeated tag values when computing overlap', () => {
    // Engram `a` has `topic:x` twice and `topic:y` once. The genuine
    // overlap with `b` is 1 tag, not 2 — without dedup, the pair would
    // outrank `[a,c]` below despite carrying the same true overlap.
    const a = makeEngram('a', { tags: ['topic:x', 'topic:x', 'topic:y'] });
    const b = makeEngram('b', { tags: ['topic:x'] });
    const c = makeEngram('c', { tags: ['topic:y'] });

    const pairs = buildContradictionPairs([a, b, c]);
    // Both pairs should report overlap=1 once the dedup fix is in.
    const pairAB = pairs.find(
      (p) => (p.a.id === 'a' && p.b.id === 'b') || (p.a.id === 'b' && p.b.id === 'a')
    );
    const pairAC = pairs.find(
      (p) => (p.a.id === 'a' && p.b.id === 'c') || (p.a.id === 'c' && p.b.id === 'a')
    );

    expect(pairAB?.overlap).toBe(1);
    expect(pairAC?.overlap).toBe(1);
  });

  it('ranks pairs by overlap descending', () => {
    const a = makeEngram('a', { tags: ['t1', 't2', 't3'] });
    const b = makeEngram('b', { tags: ['t1', 't2', 't3'] });
    const c = makeEngram('c', { tags: ['t1'] });

    const pairs = buildContradictionPairs([a, b, c]);
    expect(pairs[0]?.overlap).toBeGreaterThanOrEqual(pairs[1]?.overlap ?? 0);
    // The (a,b) pair has 3 shared tags and must come first.
    expect(pairs[0]?.a.id === 'a' || pairs[0]?.b.id === 'a').toBe(true);
    expect(pairs[0]?.a.id === 'b' || pairs[0]?.b.id === 'b').toBe(true);
    expect(pairs[0]?.overlap).toBe(3);
  });
});
