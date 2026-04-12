import { describe, expect, it } from 'vitest';

import { weightedSample } from './selection-policy.js';

describe('weightedSample', () => {
  it('returns empty array for empty input', () => {
    expect(weightedSample([], 5)).toEqual([]);
  });

  it('returns all items when count >= pool size', () => {
    const items = [
      { id: 1, weight: 1 },
      { id: 2, weight: 2 },
    ];
    const result = weightedSample(items, 5);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((r) => r.id))).toEqual(new Set([1, 2]));
  });

  it('returns requested count when pool is larger', () => {
    const items = [
      { id: 1, weight: 1 },
      { id: 2, weight: 2 },
      { id: 3, weight: 3 },
      { id: 4, weight: 4 },
      { id: 5, weight: 5 },
    ];
    const result = weightedSample(items, 2);
    expect(result).toHaveLength(2);
    // All returned items should be unique
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('never returns duplicates', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      weight: 1,
    }));
    // Run multiple times to catch randomness issues
    for (let trial = 0; trial < 20; trial++) {
      const result = weightedSample(items, 5);
      const ids = result.map((r) => r.id);
      expect(new Set(ids).size).toBe(5);
    }
  });

  it('handles zero-weight items by stopping early', () => {
    const items = [
      { id: 1, weight: 0 },
      { id: 2, weight: 0 },
    ];
    const result = weightedSample(items, 2);
    expect(result).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const items = [
      { id: 1, weight: 1 },
      { id: 2, weight: 2 },
    ];
    const original = [...items];
    weightedSample(items, 1);
    expect(items).toEqual(original);
  });

  it('higher weight items are selected more often (statistical)', () => {
    const items = [
      { id: 'heavy', weight: 100 },
      { id: 'light', weight: 1 },
    ];
    let heavyFirst = 0;
    const trials = 100;
    for (let i = 0; i < trials; i++) {
      const result = weightedSample(items, 1);
      if (result[0]?.id === 'heavy') heavyFirst++;
    }
    // Heavy item should be picked first >80% of the time (expected ~99%)
    expect(heavyFirst).toBeGreaterThan(80);
  });
});
