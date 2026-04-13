import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { createCaller } from '../../../shared/test-utils.js';
import {
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('comparisons.recordSkip', () => {
  function seedPair() {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    const movieA = seedMovie(db, { title: 'Movie A', tmdb_id: 100 });
    const movieB = seedMovie(db, { title: 'Movie B', tmdb_id: 200 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieB, completed: 1 });
    return { dimId, movieA, movieB };
  }

  it('records a skip and returns skipUntil', async () => {
    const { dimId, movieA, movieB } = seedPair();

    const result = await caller.media.comparisons.recordSkip({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: movieA,
      mediaBType: 'movie',
      mediaBId: movieB,
    });

    expect(result.data.skipUntil).toBe(10);
    expect(result.message).toBe('Skip recorded');
  });

  it('extends cooloff on repeated skip', async () => {
    const { dimId, movieA, movieB } = seedPair();

    // First skip → skipUntil = 10
    await caller.media.comparisons.recordSkip({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: movieA,
      mediaBType: 'movie',
      mediaBId: movieB,
    });

    // Record a comparison to bump global count
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: movieA,
      mediaBType: 'movie',
      mediaBId: movieB,
      winnerType: 'movie',
      winnerId: movieA,
    });

    // Second skip → skipUntil = 11 (global count 1 + 10)
    const result = await caller.media.comparisons.recordSkip({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: movieA,
      mediaBType: 'movie',
      mediaBId: movieB,
    });

    expect(result.data.skipUntil).toBe(11);
  });
});
