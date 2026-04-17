import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { movies, rotationCandidates, rotationExclusions, rotationSources } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { setupTestContext } from '../../../shared/test-utils.js';
import { aggregateCandidates, weightedSample } from './selection-policy.js';

// ---------------------------------------------------------------------------
// Unit tests: weightedSample (pure function)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Integration tests: aggregateCandidates (with database)
// ---------------------------------------------------------------------------

const ctx = setupTestContext();

function insertSource(overrides: Partial<typeof rotationSources.$inferInsert> = {}) {
  const db = getDrizzle();
  return db
    .insert(rotationSources)
    .values({ type: 'test', name: 'Test', priority: 5, enabled: 1, ...overrides })
    .returning()
    .get();
}

function insertCandidate(
  sourceId: number,
  tmdbId: number,
  overrides: Partial<typeof rotationCandidates.$inferInsert> = {}
) {
  const db = getDrizzle();
  return db
    .insert(rotationCandidates)
    .values({
      sourceId,
      tmdbId,
      title: `Movie ${tmdbId}`,
      status: 'pending',
      ...overrides,
    })
    .returning()
    .get();
}

describe('aggregateCandidates', () => {
  beforeEach(() => {
    ctx.setup();
  });

  afterEach(() => {
    ctx.teardown();
  });

  it('returns empty array when no pending candidates', () => {
    const result = aggregateCandidates(5);
    expect(result).toEqual([]);
  });

  it('selects pending candidates with computed weights', () => {
    const source = insertSource({ priority: 10 });
    insertCandidate(source.id, 100, { rating: 8.0 });

    const result = aggregateCandidates(1);

    expect(result).toHaveLength(1);
    expect(result[0]!.tmdbId).toBe(100);
    expect(result[0]!.weight).toBe(10 * (8.0 / 10)); // priority × (rating / 10) = 8.0
  });

  it('uses 0.5 fallback for null rating', () => {
    const source = insertSource({ priority: 6 });
    insertCandidate(source.id, 200, { rating: null });

    const result = aggregateCandidates(1);

    expect(result).toHaveLength(1);
    expect(result[0]!.weight).toBe(6 * 0.5); // priority × 0.5 = 3.0
  });

  it('excludes movies already in library', () => {
    const db = getDrizzle();
    const source = insertSource();

    // Add a movie to the library
    db.insert(movies).values({ tmdbId: 300, title: 'Library Movie' }).run();

    // Add same tmdb_id as candidate
    insertCandidate(source.id, 300);
    // Add a non-library candidate
    insertCandidate(source.id, 301);

    const result = aggregateCandidates(5);

    expect(result).toHaveLength(1);
    expect(result[0]!.tmdbId).toBe(301);
  });

  it('excludes movies on exclusion list', () => {
    const db = getDrizzle();
    const source = insertSource();

    // Add to exclusion list
    db.insert(rotationExclusions).values({ tmdbId: 400, title: 'Excluded' }).run();

    insertCandidate(source.id, 400);
    insertCandidate(source.id, 401);

    const result = aggregateCandidates(5);

    expect(result).toHaveLength(1);
    expect(result[0]!.tmdbId).toBe(401);
  });

  it('uses source priority from the candidate row', () => {
    const highPriority = insertSource({ priority: 9, name: 'High' });
    const lowPriority = insertSource({ priority: 2, name: 'Low' });

    // Different tmdb_ids from different priority sources
    insertCandidate(highPriority.id, 500, { rating: 8.0 });
    insertCandidate(lowPriority.id, 501, { rating: 8.0 });

    const result = aggregateCandidates(2);

    expect(result).toHaveLength(2);
    const high = result.find((r) => r.tmdbId === 500);
    const low = result.find((r) => r.tmdbId === 501);
    expect(high!.sourcePriority).toBe(9);
    expect(low!.sourcePriority).toBe(2);
    expect(high!.weight).toBeGreaterThan(low!.weight);
  });

  it('samples without replacement', () => {
    const source = insertSource();
    insertCandidate(source.id, 600, { rating: 5.0 });
    insertCandidate(source.id, 601, { rating: 5.0 });
    insertCandidate(source.id, 602, { rating: 5.0 });

    const result = aggregateCandidates(3);

    expect(result).toHaveLength(3);
    const tmdbIds = result.map((r) => r.tmdbId);
    expect(new Set(tmdbIds).size).toBe(3);
  });

  it('returns 0 for count <= 0', () => {
    const source = insertSource();
    insertCandidate(source.id, 700);

    expect(aggregateCandidates(0)).toEqual([]);
    expect(aggregateCandidates(-1)).toEqual([]);
  });
});
