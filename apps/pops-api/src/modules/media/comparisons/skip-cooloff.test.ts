import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';
import {
  getGlobalComparisonCount,
  isPairOnCooloff,
  recordComparison,
  recordSkip,
} from './service.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('skip cooloff', () => {
  function seedComparisonPair() {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    const movieA = seedMovie(db, { title: 'Movie A', tmdb_id: 100 });
    const movieB = seedMovie(db, { title: 'Movie B', tmdb_id: 200 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieB, completed: 1 });
    return { dimId, movieA, movieB };
  }

  describe('getGlobalComparisonCount', () => {
    it('returns 0 when no comparisons exist', () => {
      expect(getGlobalComparisonCount()).toBe(0);
    });

    it('counts all comparisons across dimensions', () => {
      const { dimId, movieA, movieB } = seedComparisonPair();
      recordComparison({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: movieA,
        mediaBType: 'movie',
        mediaBId: movieB,
        winnerType: 'movie',
        winnerId: movieA,
      });
      expect(getGlobalComparisonCount()).toBe(1);
    });
  });

  describe('recordSkip', () => {
    it('creates a cooloff entry for a skipped pair', () => {
      const { dimId, movieA, movieB } = seedComparisonPair();
      recordSkip(dimId, 'movie', movieA, 'movie', movieB);

      const onCooloff = isPairOnCooloff(dimId, 'movie', movieA, 'movie', movieB);
      expect(onCooloff).toBe(true);
    });

    it('upsert extends cooloff when pair already has one', () => {
      const { dimId, movieA, movieB } = seedComparisonPair();

      // First skip at global count 0 → skip_until = 10
      recordSkip(dimId, 'movie', movieA, 'movie', movieB);

      // Add 5 comparisons (each must be a unique pair to avoid override dedup)
      const extraMovies: number[] = [];
      for (let i = 0; i < 6; i++) {
        const m = seedMovie(db, { title: `Extra ${i}`, tmdb_id: 300 + i });
        seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m, completed: 1 });
        extraMovies.push(m);
      }
      for (let i = 0; i < 5; i++) {
        recordComparison({
          dimensionId: dimId,
          mediaAType: 'movie',
          mediaAId: extraMovies[i]!,
          mediaBType: 'movie',
          mediaBId: extraMovies[i + 1]!,
          winnerType: 'movie',
          winnerId: extraMovies[i]!,
        });
      }
      expect(getGlobalComparisonCount()).toBe(5);

      // Second skip at global count 5 → skip_until = 15
      recordSkip(dimId, 'movie', movieA, 'movie', movieB);

      // Still on cooloff (5 < 15)
      expect(isPairOnCooloff(dimId, 'movie', movieA, 'movie', movieB)).toBe(true);
    });
  });

  describe('isPairOnCooloff', () => {
    it('returns false when no cooloff exists', () => {
      const { dimId, movieA, movieB } = seedComparisonPair();
      expect(isPairOnCooloff(dimId, 'movie', movieA, 'movie', movieB)).toBe(false);
    });

    it('returns true during cooloff period', () => {
      const { dimId, movieA, movieB } = seedComparisonPair();
      recordSkip(dimId, 'movie', movieA, 'movie', movieB);

      // Global count is 0, skip_until is 10
      expect(isPairOnCooloff(dimId, 'movie', movieA, 'movie', movieB)).toBe(true);
    });

    it('returns false after 10 more comparisons', () => {
      const { dimId, movieA, movieB } = seedComparisonPair();
      recordSkip(dimId, 'movie', movieA, 'movie', movieB);
      // skip_until = 10

      // Add 10 comparisons (each must be a unique pair to avoid override dedup)
      const extraMovies: number[] = [];
      for (let i = 0; i < 11; i++) {
        const m = seedMovie(db, { title: `Extra ${i}`, tmdb_id: 300 + i });
        seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m, completed: 1 });
        extraMovies.push(m);
      }
      for (let i = 0; i < 10; i++) {
        recordComparison({
          dimensionId: dimId,
          mediaAType: 'movie',
          mediaAId: extraMovies[i]!,
          mediaBType: 'movie',
          mediaBId: extraMovies[i + 1]!,
          winnerType: 'movie',
          winnerId: extraMovies[i]!,
        });
      }

      expect(getGlobalComparisonCount()).toBe(10);
      // Global count 10 is NOT < skip_until 10 → cooloff expired
      expect(isPairOnCooloff(dimId, 'movie', movieA, 'movie', movieB)).toBe(false);
    });

    it('symmetry: checking B-vs-A matches A-vs-B', () => {
      const { dimId, movieA, movieB } = seedComparisonPair();
      // Skip with A, B order
      recordSkip(dimId, 'movie', movieA, 'movie', movieB);

      // Check with B, A order — should still be on cooloff
      expect(isPairOnCooloff(dimId, 'movie', movieB, 'movie', movieA)).toBe(true);
    });

    it('symmetry: skip recorded as B-vs-A is found when checking A-vs-B', () => {
      const { dimId, movieA, movieB } = seedComparisonPair();
      // Skip with B, A order
      recordSkip(dimId, 'movie', movieB, 'movie', movieA);

      // Check with A, B order
      expect(isPairOnCooloff(dimId, 'movie', movieA, 'movie', movieB)).toBe(true);
    });
  });
});
