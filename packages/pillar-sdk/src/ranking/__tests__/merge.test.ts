import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PILLAR_WEIGHT,
  SETTINGS_KEY_PREFIX,
  mergeResults,
  pillarWeightSettingKey,
} from '../merge.js';

import type { ScoredResult } from '../types.js';

function r(score: number, entityName: string, data: unknown = null): ScoredResult {
  return { score, entityName, data };
}

describe('mergeResults', () => {
  it('returns an empty list when every pillar is empty', () => {
    const merged = mergeResults(
      new Map([
        ['finance', []],
        ['media', []],
      ])
    );
    expect(merged).toEqual([]);
  });

  it('normalises per pillar so a 100-result pillar cannot dominate a 1-result pillar', () => {
    const finance: ScoredResult[] = Array.from({ length: 100 }, (_, i) => r(100 - i, `tx-${i}`));
    const media: ScoredResult[] = [r(0.5, 'movie-A')];

    const merged = mergeResults(
      new Map([
        ['finance', finance],
        ['media', media],
      ])
    );

    expect(merged[0]?.pillarId).toBe('finance');
    expect(merged[0]?.adjustedScore).toBe(1);
    expect(merged[1]?.pillarId).toBe('media');
    expect(merged[1]?.adjustedScore).toBe(1);
    expect(merged).toHaveLength(101);
  });

  it('applies per-pillar weights', () => {
    const merged = mergeResults(
      new Map([
        ['finance', [r(10, 'tx-1')]],
        ['media', [r(10, 'movie-1')]],
      ]),
      {
        weights: new Map([
          ['finance', 2],
          ['media', 0.5],
        ]),
      }
    );

    expect(merged[0]?.pillarId).toBe('finance');
    expect(merged[0]?.adjustedScore).toBe(2);
    expect(merged[1]?.pillarId).toBe('media');
    expect(merged[1]?.adjustedScore).toBe(0.5);
  });

  it('defaults missing weights to 1.0', () => {
    const merged = mergeResults(
      new Map([
        ['finance', [r(5, 'tx-1')]],
        ['media', [r(5, 'movie-1')]],
      ]),
      { weights: new Map([['finance', 3]]) }
    );

    const media = merged.find((m) => m.pillarId === 'media');
    expect(media?.adjustedScore).toBe(DEFAULT_PILLAR_WEIGHT);
  });

  it('clamps negative weights to 0 and logs a warning', () => {
    const onWarn = vi.fn();
    const merged = mergeResults(
      new Map([
        ['finance', [r(10, 'tx-1')]],
        ['media', [r(10, 'movie-1')]],
      ]),
      {
        weights: new Map([
          ['finance', -2],
          ['media', 1],
        ]),
        onWarn,
      }
    );

    expect(onWarn).toHaveBeenCalledOnce();
    expect(onWarn.mock.calls[0]?.[0]).toContain('finance');
    expect(onWarn.mock.calls[0]?.[0]).toContain('-2');
    expect(merged[0]?.pillarId).toBe('media');
    const finance = merged.find((m) => m.pillarId === 'finance');
    expect(finance?.adjustedScore).toBe(0);
  });

  it('breaks ties on equal adjusted scores by insertion order (adapter priority)', () => {
    const merged = mergeResults(
      new Map([
        ['finance', [r(1, 'tx-1')]],
        ['media', [r(1, 'movie-1')]],
        ['inventory', [r(1, 'item-1')]],
      ])
    );

    expect(merged.map((m) => m.pillarId)).toEqual(['finance', 'media', 'inventory']);
  });

  it('falls back to alphabetical entityName when every result is score 0', () => {
    const merged = mergeResults(
      new Map([
        ['finance', [r(0, 'zebra'), r(0, 'apple')]],
        ['media', [r(0, 'mango')]],
      ])
    );

    expect(merged.map((m) => m.entityName)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('all-zero fallback breaks alphabetical ties by pillar order', () => {
    const merged = mergeResults(
      new Map([
        ['finance', [r(0, 'duplicate')]],
        ['media', [r(0, 'duplicate')]],
      ])
    );

    expect(merged.map((m) => m.pillarId)).toEqual(['finance', 'media']);
  });

  it('handles an empty pillar without affecting the rest of the merge', () => {
    const merged = mergeResults(
      new Map([
        ['finance', []],
        ['media', [r(2, 'movie-1')]],
      ])
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.pillarId).toBe('media');
  });

  it('honours the limit option', () => {
    const merged = mergeResults(
      new Map([['finance', [r(10, 'a'), r(8, 'b'), r(6, 'c'), r(4, 'd')]]]),
      { limit: 2 }
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.entityName)).toEqual(['a', 'b']);
  });

  it('preserves the raw score on the merged result while exposing the adjusted score separately', () => {
    const merged = mergeResults(new Map([['finance', [r(42, 'tx-1')]]]), {
      weights: new Map([['finance', 0.5]]),
    });

    expect(merged[0]?.score).toBe(42);
    expect(merged[0]?.adjustedScore).toBe(0.5);
  });

  it('forwards opaque payload data untouched', () => {
    const payload = { id: 'tx-1', amount: 99 };
    const merged = mergeResults(new Map([['finance', [r(5, 'tx-1', payload)]]]));

    expect(merged[0]?.data).toBe(payload);
  });

  it('handles a pillar where every score is the same non-zero value (normalises all to 1)', () => {
    const merged = mergeResults(new Map([['finance', [r(7, 'a'), r(7, 'b'), r(7, 'c')]]]));

    for (const m of merged) {
      expect(m.adjustedScore).toBe(1);
    }
  });
});

describe('pillarWeightSettingKey', () => {
  it('composes the canonical settings key', () => {
    expect(pillarWeightSettingKey('finance')).toBe(`${SETTINGS_KEY_PREFIX}finance`);
    expect(pillarWeightSettingKey('finance')).toBe('search.pillarWeights.finance');
  });
});
