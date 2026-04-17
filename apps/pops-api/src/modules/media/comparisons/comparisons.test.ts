import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCaller,
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';
import {
  batchRecordComparisons,
  blacklistMovie,
  excludeFromDimension,
  getDebriefOpponent,
  getPendingDebriefs,
  getTierListMovies,
  includeInDimension,
} from './service.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('comparisons.listDimensions', () => {
  it('seeds 5 default dimensions when none exist', async () => {
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data).toHaveLength(5);
    expect(result.data.map((d) => d.name)).toEqual([
      'Cinematography',
      'Entertainment',
      'Emotional Impact',
      'Rewatchability',
      'Soundtrack',
    ]);
  });

  it('returns defaults sorted by sortOrder', async () => {
    const result = await caller.media.comparisons.listDimensions();
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]!.sortOrder).toBe(i);
    }
  });

  it('does not re-seed when dimensions already exist', async () => {
    seedDimension(db, { name: 'Custom Only' });
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe('Custom Only');
  });

  it('returns dimensions sorted by sortOrder', async () => {
    seedDimension(db, { name: 'Acting', sort_order: 2 });
    seedDimension(db, { name: 'Story', sort_order: 1 });
    seedDimension(db, { name: 'Visuals', sort_order: 0 });

    const result = await caller.media.comparisons.listDimensions();
    expect(result.data).toHaveLength(3);
    expect(result.data[0]!.name).toBe('Visuals');
    expect(result.data[1]!.name).toBe('Story');
    expect(result.data[2]!.name).toBe('Acting');
  });

  it('returns correct shape with boolean active', async () => {
    seedDimension(db, { name: 'Overall', active: 1 });
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data[0]!.active).toBe(true);
    expect(result.data[0]).toHaveProperty('id');
    expect(result.data[0]).toHaveProperty('name', 'Overall');
    expect(result.data[0]).toHaveProperty('createdAt');
  });
});

describe('comparisons.createDimension', () => {
  it('creates a new dimension', async () => {
    const result = await caller.media.comparisons.createDimension({
      name: 'Overall',
    });
    expect(result.data.name).toBe('Overall');
    expect(result.data.active).toBe(true);
    expect(result.data.sortOrder).toBe(0);
  });

  it('throws CONFLICT on duplicate name', async () => {
    seedDimension(db, { name: 'Overall' });

    await expect(caller.media.comparisons.createDimension({ name: 'Overall' })).rejects.toThrow(
      TRPCError
    );
  });
});

describe('comparisons.updateDimension', () => {
  it('updates dimension fields', async () => {
    const dimId = seedDimension(db, { name: 'Old Name' });

    const result = await caller.media.comparisons.updateDimension({
      id: dimId,
      data: { name: 'New Name', active: false },
    });
    expect(result.data.name).toBe('New Name');
    expect(result.data.active).toBe(false);
  });

  it('throws NOT_FOUND for missing dimension', async () => {
    await expect(
      caller.media.comparisons.updateDimension({
        id: 999,
        data: { name: 'X' },
      })
    ).rejects.toThrow(TRPCError);
  });

  it('toggles active off and back on', async () => {
    const dimId = seedDimension(db, { name: 'Toggle Me', active: 1 });

    const off = await caller.media.comparisons.updateDimension({
      id: dimId,
      data: { active: false },
    });
    expect(off.data.active).toBe(false);

    const on = await caller.media.comparisons.updateDimension({
      id: dimId,
      data: { active: true },
    });
    expect(on.data.active).toBe(true);
  });

  it('swaps sort order between dimensions', async () => {
    const dimA = seedDimension(db, { name: 'First', sort_order: 0 });
    const dimB = seedDimension(db, { name: 'Second', sort_order: 1 });

    // Swap sort orders
    await caller.media.comparisons.updateDimension({ id: dimA, data: { sortOrder: 1 } });
    await caller.media.comparisons.updateDimension({ id: dimB, data: { sortOrder: 0 } });

    const result = await caller.media.comparisons.listDimensions();
    expect(result.data[0]!.name).toBe('Second');
    expect(result.data[1]!.name).toBe('First');
  });
});

describe('comparisons.record', () => {
  it('records a comparison and returns it', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    const result = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    expect(result.data.dimensionId).toBe(dimId);
    expect(result.data.winnerId).toBe(1);
  });

  it('updates Elo scores after comparison', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    const scores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
    });
    expect(scores.data).toHaveLength(1);
    expect(scores.data[0]!.score).toBeGreaterThan(1500);
    expect(scores.data[0]!.comparisonCount).toBe(1);

    const loserScores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 2,
    });
    expect(loserScores.data[0]!.score).toBeLessThan(1500);
  });

  it('throws NOT_FOUND for missing dimension', async () => {
    await expect(
      caller.media.comparisons.record({
        dimensionId: 999,
        mediaAType: 'movie',
        mediaAId: 1,
        mediaBType: 'movie',
        mediaBId: 2,
        winnerType: 'movie',
        winnerId: 1,
      })
    ).rejects.toThrow(TRPCError);
  });

  it('throws BAD_REQUEST when winner does not match either media', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    await expect(
      caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: 1,
        mediaBType: 'movie',
        mediaBId: 2,
        winnerType: 'movie',
        winnerId: 999,
      })
    ).rejects.toThrow(TRPCError);
  });

  it('throws when dimension is inactive', async () => {
    const dimId = seedDimension(db, { name: 'Retired', active: 0 });

    await expect(
      caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: 1,
        mediaBType: 'movie',
        mediaBId: 2,
        winnerType: 'movie',
        winnerId: 1,
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe('comparisons.listForMedia', () => {
  it('returns comparisons involving a media item', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 3,
      mediaBType: 'movie',
      mediaBId: 1,
      winnerType: 'movie',
      winnerId: 1,
    });

    const result = await caller.media.comparisons.listForMedia({
      mediaType: 'movie',
      mediaId: 1,
    });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it('supports pagination', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    for (let i = 2; i <= 4; i++) {
      await caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: 1,
        mediaBType: 'movie',
        mediaBId: i,
        winnerType: 'movie',
        winnerId: 1,
      });
    }

    const result = await caller.media.comparisons.listForMedia({
      mediaType: 'movie',
      mediaId: 1,
      limit: 2,
      offset: 0,
    });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.hasMore).toBe(true);
  });
});

describe('comparisons.scores', () => {
  it('returns empty when no scores exist', async () => {
    const result = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 999,
    });
    expect(result.data).toEqual([]);
  });

  it('filters by dimension', async () => {
    const dim1 = seedDimension(db, { name: 'Story' });
    const dim2 = seedDimension(db, { name: 'Visuals' });

    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 2,
    });

    const storyScores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
      dimensionId: dim1,
    });
    expect(storyScores.data).toHaveLength(1);
    expect(storyScores.data[0]!.score).toBeGreaterThan(1500);

    const visualScores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
      dimensionId: dim2,
    });
    expect(visualScores.data).toHaveLength(1);
    expect(visualScores.data[0]!.score).toBeLessThan(1500);
  });
});

describe('comparisons.getSmartPair', () => {
  it('returns a pair of watched movies', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club', poster_path: '/fc.jpg' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix', poster_path: '/mx.jpg' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });

    const result = await caller.media.comparisons.getSmartPair({ dimensionId: dimId });
    expect(result.data).not.toBeNull();
    expect(result.data!.movieA).toHaveProperty('id');
    expect(result.data!.movieA).toHaveProperty('title');
    expect(result.data!.movieA).toHaveProperty('posterPath');
    expect(result.data!.movieB).toHaveProperty('id');
    expect(result.data!.movieB).toHaveProperty('title');
    expect(result.data!.movieA.id).not.toBe(result.data!.movieB.id);
  });

  it('returns null data when fewer than 2 watched movies', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });

    const result = await caller.media.comparisons.getSmartPair({ dimensionId: dimId });
    expect(result.data).toBeNull();
    expect(result.reason).toBe('insufficient_watched_movies');
  });

  it('returns null data when no watched movies exist', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    const result = await caller.media.comparisons.getSmartPair({ dimensionId: dimId });
    expect(result.data).toBeNull();
    expect(result.reason).toBe('insufficient_watched_movies');
  });

  it('throws NOT_FOUND for missing dimension', async () => {
    await expect(caller.media.comparisons.getSmartPair({ dimensionId: 999 })).rejects.toThrow(
      TRPCError
    );
  });

  it('returns dimensionId in response', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });

    const result = await caller.media.comparisons.getSmartPair({ dimensionId: dimId });
    expect(result.data).not.toBeNull();
    expect(result.data!.dimensionId).toBe(dimId);
  });

  it('only considers completed watches', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 0 }); // incomplete

    // Only 1 completed watch → not enough
    const result = await caller.media.comparisons.getSmartPair({ dimensionId: dimId });
    expect(result.data).toBeNull();
    expect(result.reason).toBe('insufficient_watched_movies');
  });
});

describe('comparisons.rankings', () => {
  it('returns empty when no scores exist', async () => {
    const result = await caller.media.comparisons.rankings({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('returns per-dimension rankings ordered by score', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    // Movie 1 beats movie 2, movie 1 beats movie 3
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 3,
      winnerType: 'movie',
      winnerId: 1,
    });

    const result = await caller.media.comparisons.rankings({ dimensionId: dimId });
    expect(result.data.length).toBe(3);
    expect(result.data[0]!.rank).toBe(1);
    expect(result.data[0]!.mediaId).toBe(1); // winner should be #1
    expect(result.data[0]!.score).toBeGreaterThan(1500);
    expect(result.data[1]!.rank).toBe(2);
    expect(result.data[2]!.rank).toBe(3);
  });

  it('returns overall rankings averaging across active dimensions', async () => {
    const dim1 = seedDimension(db, { name: 'Story', active: 1 });
    const dim2 = seedDimension(db, { name: 'Visuals', active: 1 });

    // Movie 1 wins in Story, Movie 2 wins in Visuals
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 2,
    });

    const result = await caller.media.comparisons.rankings({});
    expect(result.data.length).toBe(2);
    // Both should have avg score ~1500 since each won one dimension
    expect(result.data[0]!.rank).toBe(1);
    expect(result.data[1]!.rank).toBe(2);
  });

  it('filters by mediaType', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    // Movie comparison
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    // TV show comparison
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'tv_show',
      mediaAId: 10,
      mediaBType: 'tv_show',
      mediaBId: 20,
      winnerType: 'tv_show',
      winnerId: 10,
    });

    const movieRankings = await caller.media.comparisons.rankings({
      dimensionId: dimId,
      mediaType: 'movie',
    });
    expect(movieRankings.data.length).toBe(2);
    expect(movieRankings.data.every((r) => r.mediaType === 'movie')).toBe(true);

    const tvRankings = await caller.media.comparisons.rankings({
      dimensionId: dimId,
      mediaType: 'tv_show',
    });
    expect(tvRankings.data.length).toBe(2);
    expect(tvRankings.data.every((r) => r.mediaType === 'tv_show')).toBe(true);
  });

  it('supports pagination', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    // Create 4 movies with comparisons
    for (let i = 2; i <= 4; i++) {
      await caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: 1,
        mediaBType: 'movie',
        mediaBId: i,
        winnerType: 'movie',
        winnerId: 1,
      });
    }

    const page1 = await caller.media.comparisons.rankings({
      dimensionId: dimId,
      limit: 2,
      offset: 0,
    });
    expect(page1.data.length).toBe(2);
    expect(page1.pagination.total).toBe(4);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.data[0]!.rank).toBe(1);
    expect(page1.data[1]!.rank).toBe(2);

    const page2 = await caller.media.comparisons.rankings({
      dimensionId: dimId,
      limit: 2,
      offset: 2,
    });
    expect(page2.data.length).toBe(2);
    expect(page2.data[0]!.rank).toBe(3);
    expect(page2.data[1]!.rank).toBe(4);
  });

  it('excludes inactive dimensions from overall rankings', async () => {
    const activeDim = seedDimension(db, { name: 'Story', active: 1 });
    // Create as active so we can record comparisons, then deactivate
    const inactiveDim = seedDimension(db, { name: 'Inactive', active: 1 });

    await caller.media.comparisons.record({
      dimensionId: activeDim,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: inactiveDim,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 2,
    });

    // Now deactivate the dimension
    await caller.media.comparisons.updateDimension({
      id: inactiveDim,
      data: { active: false },
    });

    // Overall should only use active dimension
    const result = await caller.media.comparisons.rankings({});
    expect(result.data.length).toBe(2);
    // Movie 1 won in active dim, so should rank higher
    expect(result.data[0]!.mediaId).toBe(1);
    expect(result.data[0]!.score).toBeGreaterThan(1500);
  });

  it('breaks ties by title alphabetically (per-dimension)', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const mZebra = seedMovie(db, { tmdb_id: 601, title: 'Zebra Movie' });
    const mAlpha = seedMovie(db, { tmdb_id: 602, title: 'Alpha Movie' });

    // Each movie wins once -> scores return to ~1500
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: mZebra,
      mediaBType: 'movie',
      mediaBId: mAlpha,
      winnerType: 'movie',
      winnerId: mZebra,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: mZebra,
      mediaBType: 'movie',
      mediaBId: mAlpha,
      winnerType: 'movie',
      winnerId: mAlpha,
    });

    const result = await caller.media.comparisons.rankings({ dimensionId: dimId });
    expect(result.data.length).toBe(2);
    // Equal scores -> alphabetical: Alpha before Zebra
    expect(result.data[0]!.mediaId).toBe(mAlpha);
    expect(result.data[1]!.mediaId).toBe(mZebra);
  });

  it('sorts zero-comparison items after scored items (per-dimension)', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const mScored1 = seedMovie(db, { tmdb_id: 701, title: 'Scored Movie' });
    const mScored2 = seedMovie(db, { tmdb_id: 702, title: 'Another Scored' });
    const mUnscored = seedMovie(db, { tmdb_id: 703, title: 'Aardvark Unscored' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: mScored1,
      mediaBType: 'movie',
      mediaBId: mScored2,
      winnerType: 'movie',
      winnerId: mScored1,
    });

    // Insert an unscored entry (comparison_count = 0, score = 1500)
    db.prepare(
      `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count)
       VALUES ('movie', ?, ?, 1500.0, 0)`
    ).run(mUnscored, dimId);

    const result = await caller.media.comparisons.rankings({ dimensionId: dimId });
    expect(result.data.length).toBe(3);
    // Unscored item should be last despite alphabetically first title
    expect(result.data[2]!.mediaId).toBe(mUnscored);
    expect(result.data[2]!.comparisonCount).toBe(0);
  });

  it('breaks ties by title in overall rankings', async () => {
    const dim1 = seedDimension(db, { name: 'Story', active: 1 });
    const dim2 = seedDimension(db, { name: 'Visuals', active: 1 });
    const mZebra = seedMovie(db, { tmdb_id: 801, title: 'Zebra Film' });
    const mAlpha = seedMovie(db, { tmdb_id: 802, title: 'Alpha Film' });

    // Each movie wins one dimension -> average scores should be equal
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: mZebra,
      mediaBType: 'movie',
      mediaBId: mAlpha,
      winnerType: 'movie',
      winnerId: mZebra,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: mZebra,
      mediaBType: 'movie',
      mediaBId: mAlpha,
      winnerType: 'movie',
      winnerId: mAlpha,
    });

    const result = await caller.media.comparisons.rankings({});
    expect(result.data.length).toBe(2);
    // Equal average scores -> alphabetical: Alpha before Zebra
    expect(result.data[0]!.mediaId).toBe(mAlpha);
    expect(result.data[1]!.mediaId).toBe(mZebra);
  });
});

describe('comparisons.delete', () => {
  it('deletes a comparison and removes it from listAll', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    const recorded = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    const before = await caller.media.comparisons.listAll({});
    expect(before.pagination.total).toBe(1);

    const result = await caller.media.comparisons.delete({
      id: recorded.data.id,
    });
    expect(result.message).toBe('Comparison deleted and scores recalculated');

    const after = await caller.media.comparisons.listAll({});
    expect(after.pagination.total).toBe(0);
  });

  it('throws NOT_FOUND for non-existent comparison', async () => {
    await expect(caller.media.comparisons.delete({ id: 999 })).rejects.toThrow(TRPCError);

    try {
      await caller.media.comparisons.delete({ id: 999 });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });

  it('rejects unauthenticated calls', async () => {
    const anonCaller = createCaller(false);
    await expect(anonCaller.media.comparisons.delete({ id: 1 })).rejects.toThrow(TRPCError);
  });
});

describe('comparisons.delete (Elo recalculation)', () => {
  it('resets scores to 1500 when deleting the only comparison', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    const recorded = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    // Verify scores changed from default
    const beforeWinner = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
    });
    expect(beforeWinner.data[0]!.score).toBeGreaterThan(1500);

    await caller.media.comparisons.delete({ id: recorded.data.id });

    // Both scores should be reset to 1500 with comparisonCount=0
    const winnerScores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
    });
    expect(winnerScores.data[0]!.score).toBe(1500);
    expect(winnerScores.data[0]!.comparisonCount).toBe(0);

    const loserScores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 2,
    });
    expect(loserScores.data[0]!.score).toBe(1500);
    expect(loserScores.data[0]!.comparisonCount).toBe(0);
  });

  it('recalculates scores correctly when deleting one of multiple comparisons', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    // Record two comparisons: movie 1 beats 2, movie 1 beats 3
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    const second = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 3,
      winnerType: 'movie',
      winnerId: 1,
    });

    // Delete second comparison (1 vs 3)
    await caller.media.comparisons.delete({ id: second.data.id });

    // Movie 1 should still be above 1500 (won vs movie 2)
    const scores1 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
    });
    expect(scores1.data[0]!.score).toBeGreaterThan(1500);
    expect(scores1.data[0]!.comparisonCount).toBe(1);

    // Movie 2 should be below 1500 (lost to movie 1)
    const scores2 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 2,
    });
    expect(scores2.data[0]!.score).toBeLessThan(1500);
    expect(scores2.data[0]!.comparisonCount).toBe(1);

    // Movie 3 should be back to 1500 (no remaining comparisons)
    const scores3 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 3,
    });
    expect(scores3.data[0]!.score).toBe(1500);
    expect(scores3.data[0]!.comparisonCount).toBe(0);
  });

  it('does not affect scores in other dimensions', async () => {
    const dim1 = seedDimension(db, { name: 'Story' });
    const dim2 = seedDimension(db, { name: 'Visuals' });

    // Record in both dimensions
    const comp1 = await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 2,
    });

    // Capture dim2 scores before delete
    const dim2Before = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
      dimensionId: dim2,
    });

    // Delete the dim1 comparison
    await caller.media.comparisons.delete({ id: comp1.data.id });

    // dim2 scores should be unchanged
    const dim2After = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
      dimensionId: dim2,
    });
    expect(dim2After.data[0]!.score).toBe(dim2Before.data[0]!.score);
    expect(dim2After.data[0]!.comparisonCount).toBe(dim2Before.data[0]!.comparisonCount);
  });

  it('replays correctly when deleting middle comparison from a chain', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    // Record a fresh single comparison to get the expected scores
    // First, build the chain: A beats B, B beats C, A beats C
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    const comp2 = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 2,
      mediaBType: 'movie',
      mediaBId: 3,
      winnerType: 'movie',
      winnerId: 2,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 3,
      winnerType: 'movie',
      winnerId: 1,
    });

    // Delete middle comparison (B beats C)
    await caller.media.comparisons.delete({ id: comp2.data.id });

    // Should have 2 remaining comparisons
    const remaining = await caller.media.comparisons.listAll({ dimensionId: dimId });
    expect(remaining.pagination.total).toBe(2);

    // Movie 1 should be top ranked (won both remaining comparisons)
    const scores1 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
    });
    expect(scores1.data[0]!.score).toBeGreaterThan(1500);
    expect(scores1.data[0]!.comparisonCount).toBe(2);

    // Movie 2 should have 1 comparison (lost to movie 1)
    const scores2 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 2,
    });
    expect(scores2.data[0]!.comparisonCount).toBe(1);
    expect(scores2.data[0]!.score).toBeLessThan(1500);

    // Movie 3 should have 1 comparison (lost to movie 1)
    const scores3 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 3,
    });
    expect(scores3.data[0]!.comparisonCount).toBe(1);
    expect(scores3.data[0]!.score).toBeLessThan(1500);
  });

  it('produces same scores as fresh recording after delete and replay', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    // Record two comparisons, then delete the first
    const comp1 = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 2,
      mediaBType: 'movie',
      mediaBId: 3,
      winnerType: 'movie',
      winnerId: 2,
    });

    // Delete first comparison — only comp2 (movie 2 beats 3) remains
    await caller.media.comparisons.delete({ id: comp1.data.id });

    const afterDelete2 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 2,
    });
    const afterDelete3 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 3,
    });

    // The replayed scores for a single "2 beats 3" comparison should match
    // what you'd get from a fresh comparison at default 1500 ratings.
    // K=32, expected=0.5 for equal ratings → winner gets 1500+16=1516, loser gets 1500-16=1484
    expect(afterDelete2.data[0]!.score).toBe(1516);
    expect(afterDelete3.data[0]!.score).toBe(1484);
    expect(afterDelete2.data[0]!.comparisonCount).toBe(1);
    expect(afterDelete3.data[0]!.comparisonCount).toBe(1);
  });
});

describe('comparisons.listAll', () => {
  it('returns all comparisons across dimensions', async () => {
    const dim1 = seedDimension(db, { name: 'Story' });
    const dim2 = seedDimension(db, { name: 'Visuals' });

    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 2,
    });

    const result = await caller.media.comparisons.listAll({});
    expect(result.pagination.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it('filters by dimensionId', async () => {
    const dim1 = seedDimension(db, { name: 'Story' });
    const dim2 = seedDimension(db, { name: 'Visuals' });

    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 2,
    });

    const result = await caller.media.comparisons.listAll({ dimensionId: dim1 });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0]!.dimensionId).toBe(dim1);
  });

  it('supports pagination', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    for (let i = 2; i <= 4; i++) {
      await caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: 1,
        mediaBType: 'movie',
        mediaBId: i,
        winnerType: 'movie',
        winnerId: 1,
      });
    }

    const page1 = await caller.media.comparisons.listAll({ limit: 2, offset: 0 });
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await caller.media.comparisons.listAll({ limit: 2, offset: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

describe('dimension weights', () => {
  it('listDimensions returns weight field defaulting to 1.0', async () => {
    seedDimension(db, { name: 'Story' });
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data[0]!.weight).toBe(1.0);
  });

  it('createDimension with custom weight', async () => {
    const result = await caller.media.comparisons.createDimension({
      name: 'Cinematography',
      weight: 2.5,
    });
    expect(result.data.weight).toBe(2.5);
  });

  it('updateDimension updates weight', async () => {
    const dimId = seedDimension(db, { name: 'Story' });
    const result = await caller.media.comparisons.updateDimension({
      id: dimId,
      data: { weight: 3.0 },
    });
    expect(result.data.weight).toBe(3.0);
  });

  it('weighted overall ranking uses weighted average', async () => {
    // dim1 has weight 3.0, dim2 has weight 1.0
    const dim1 = seedDimension(db, { name: 'Story', active: 1, weight: 3.0 });
    const dim2 = seedDimension(db, { name: 'Visuals', active: 1, weight: 1.0 });

    // Movie 1 wins on Story (weight=3), Movie 2 wins on Visuals (weight=1)
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 2,
    });

    // Overall: Movie 1 should rank higher because Story (weight=3) outweighs Visuals (weight=1)
    const result = await caller.media.comparisons.rankings({});
    expect(result.data).toHaveLength(2);
    expect(result.data[0]!.mediaId).toBe(1);
    expect(result.data[0]!.score).toBeGreaterThan(1500);
    expect(result.data[1]!.mediaId).toBe(2);
    expect(result.data[1]!.score).toBeLessThan(1500);
  });

  it('equal weights produce same result as simple average', async () => {
    const dim1 = seedDimension(db, { name: 'Story', active: 1, weight: 1.0 });
    const dim2 = seedDimension(db, { name: 'Visuals', active: 1, weight: 1.0 });

    // Movie 1 wins both dimensions
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    // Get per-dimension scores
    const dim1Rankings = await caller.media.comparisons.rankings({ dimensionId: dim1 });
    const dim2Rankings = await caller.media.comparisons.rankings({ dimensionId: dim2 });

    const movie1Dim1Score = dim1Rankings.data.find((r) => r.mediaId === 1)!.score;
    const movie1Dim2Score = dim2Rankings.data.find((r) => r.mediaId === 1)!.score;
    const expectedAvg = Math.round(((movie1Dim1Score + movie1Dim2Score) / 2) * 10) / 10;

    // Overall should equal simple average when weights are equal
    const overall = await caller.media.comparisons.rankings({});
    const movie1Overall = overall.data.find((r) => r.mediaId === 1)!.score;
    expect(movie1Overall).toBe(expectedAvg);
  });
});

describe('tiered draws', () => {
  it('high draw: both movies gain score', async () => {
    const dimId = seedDimension(db, { name: 'Story' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 0,
      drawTier: 'high',
    });

    const scoresA = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
      dimensionId: dimId,
    });
    const scoresB = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 2,
      dimensionId: dimId,
    });
    // Both should be above 1500 (outcome 0.7 > expected 0.5)
    expect(scoresA.data[0]!.score).toBeGreaterThan(1500);
    expect(scoresB.data[0]!.score).toBeGreaterThan(1500);
  });

  it('mid draw: both movies stay at 1500', async () => {
    const dimId = seedDimension(db, { name: 'Visuals' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 0,
      drawTier: 'mid',
    });

    const scoresA = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
      dimensionId: dimId,
    });
    const scoresB = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 2,
      dimensionId: dimId,
    });
    expect(scoresA.data[0]!.score).toBe(1500);
    expect(scoresB.data[0]!.score).toBe(1500);
  });

  it('low draw: both movies lose score', async () => {
    const dimId = seedDimension(db, { name: 'Sound' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 0,
      drawTier: 'low',
    });

    const scoresA = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
      dimensionId: dimId,
    });
    const scoresB = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 2,
      dimensionId: dimId,
    });
    expect(scoresA.data[0]!.score).toBeLessThan(1500);
    expect(scoresB.data[0]!.score).toBeLessThan(1500);
  });

  it('legacy draw without tier uses 0.5 (neutral)', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 0,
    });

    const scoresA = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
      dimensionId: dimId,
    });
    expect(scoresA.data[0]!.score).toBe(1500);
  });
});

describe('calculateConfidence', () => {
  it('returns 0 at count=0', async () => {
    const { calculateConfidence } = await import('./types.js');
    expect(calculateConfidence(0)).toBe(0);
  });

  it('returns ~0.29 at count=1', async () => {
    const { calculateConfidence } = await import('./types.js');
    expect(calculateConfidence(1)).toBeCloseTo(0.2929, 3);
  });

  it('returns ~0.5 at count=3', async () => {
    const { calculateConfidence } = await import('./types.js');
    expect(calculateConfidence(3)).toBeCloseTo(0.5, 1);
  });

  it('returns ~0.82 at count=30', async () => {
    const { calculateConfidence } = await import('./types.js');
    expect(calculateConfidence(30)).toBeCloseTo(0.8204, 2);
  });
});

describe('calculateOverallConfidence', () => {
  it('returns 0 when all dimensions have 0 comparisons', async () => {
    const { calculateOverallConfidence } = await import('./types.js');
    expect(calculateOverallConfidence([0, 0, 0], 3)).toBe(0);
  });

  it('returns 0 when totalActiveDimensions is 0', async () => {
    const { calculateOverallConfidence } = await import('./types.js');
    expect(calculateOverallConfidence([], 0)).toBe(0);
  });

  it('penalizes sparse coverage', async () => {
    const { calculateOverallConfidence, calculateConfidence } = await import('./types.js');
    // 7 comparisons in 1 of 10 dimensions → (1/10) × conf(7)
    const expected = (1 / 10) * calculateConfidence(7);
    expect(calculateOverallConfidence([7], 10)).toBeCloseTo(expected, 4);
  });

  it('rewards full coverage', async () => {
    const { calculateOverallConfidence, calculateConfidence } = await import('./types.js');
    // 3 comparisons in all 3 dimensions → (3/3) × conf(3)
    const expected = (3 / 3) * calculateConfidence(3);
    expect(calculateOverallConfidence([3, 3, 3], 3)).toBeCloseTo(expected, 4);
  });

  it('computes coverage × avgDepth for mixed counts', async () => {
    const { calculateOverallConfidence, calculateConfidence } = await import('./types.js');
    // 3 comparisons in dim1, 1 in dim2, 0 in dim3 (but only 2 dims have scores)
    // coverage = 2/3, avgDepth = (conf(3) + conf(1)) / 2
    const avgDepth = (calculateConfidence(3) + calculateConfidence(1)) / 2;
    const expected = (2 / 3) * avgDepth;
    expect(calculateOverallConfidence([3, 1], 3)).toBeCloseTo(expected, 4);
  });

  it('missing dimensions count against coverage but not depth', async () => {
    const { calculateOverallConfidence, calculateConfidence } = await import('./types.js');
    // Movie has scores in 2 of 5 dims, both with 10 comparisons
    // coverage = 2/5, avgDepth = conf(10)
    const expected = (2 / 5) * calculateConfidence(10);
    expect(calculateOverallConfidence([10, 10], 5)).toBeCloseTo(expected, 4);
  });
});

describe('confidence in API responses', () => {
  it('scores endpoint includes confidence per entry', async () => {
    const dimId = seedDimension(db, { name: 'Story' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    const result = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: 1,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.confidence).toBeCloseTo(0.2929, 3);
    expect(result.data[0]!.comparisonCount).toBe(1);
  });

  it('per-dimension rankings include confidence', async () => {
    const dimId = seedDimension(db, { name: 'Visuals' });

    // Do 2 comparisons so movie 1 has comparisonCount=2
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 3,
      winnerType: 'movie',
      winnerId: 1,
    });

    const result = await caller.media.comparisons.rankings({ dimensionId: dimId });
    // Movie 1 has 2 comparisons
    const movie1 = result.data.find((r) => r.mediaId === 1);
    expect(movie1).toBeDefined();
    expect(movie1!.confidence).toBeCloseTo(1 - 1 / Math.sqrt(3), 3); // count=2 → sqrt(3)
  });

  it('overall rankings confidence = coverage × average depth', async () => {
    const dim1 = seedDimension(db, { name: 'Story', active: 1 });
    const dim2 = seedDimension(db, { name: 'Visuals', active: 1 });

    // Movie 1: 3 comparisons in dim1, 1 comparison in dim2
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 3,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 4,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    const result = await caller.media.comparisons.rankings({});
    const movie1 = result.data.find((r) => r.mediaId === 1);
    expect(movie1).toBeDefined();
    // dim1: 3 comparisons → confidence ~0.5, dim2: 1 comparison → confidence ~0.29
    // coverage = 2/2 = 1.0, avgDepth = (0.5 + 0.29) / 2 ≈ 0.396
    // overall = 1.0 × 0.396 ≈ 0.396
    const conf1 = 1 - 1 / Math.sqrt(4); // count=3
    const conf2 = 1 - 1 / Math.sqrt(2); // count=1
    const expected = (2 / 2) * ((conf1 + conf2) / 2);
    expect(movie1!.confidence).toBeCloseTo(expected, 3);
  });

  it('per-dimension rankings exclude excluded movies', async () => {
    const dimId = seedDimension(db, { name: 'Story' });

    // Record comparisons: movie 1 > 2 > 3
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 2,
      mediaBType: 'movie',
      mediaBId: 3,
      winnerType: 'movie',
      winnerId: 2,
    });

    // Exclude movie 1 from this dimension
    excludeFromDimension('movie', 1, dimId);

    const result = await caller.media.comparisons.rankings({ dimensionId: dimId });
    expect(result.data.length).toBe(2);
    expect(result.data.every((r) => r.mediaId !== 1)).toBe(true);
    expect(result.pagination.total).toBe(2);
  });

  it('excluded movie still appears in other dimensions rankings', async () => {
    const dim1 = seedDimension(db, { name: 'Story', active: 1 });
    const dim2 = seedDimension(db, { name: 'Visuals', active: 1 });

    // Movie 1 vs 2 in both dimensions
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    // Exclude movie 1 from dim1 only
    excludeFromDimension('movie', 1, dim1);

    const dim1Rankings = await caller.media.comparisons.rankings({ dimensionId: dim1 });
    expect(dim1Rankings.data.every((r) => r.mediaId !== 1)).toBe(true);

    const dim2Rankings = await caller.media.comparisons.rankings({ dimensionId: dim2 });
    expect(dim2Rankings.data.some((r) => r.mediaId === 1)).toBe(true);
  });

  it('overall rankings exclude movies from dimensions where excluded', async () => {
    const dim1 = seedDimension(db, { name: 'Story', active: 1 });
    const dim2 = seedDimension(db, { name: 'Visuals', active: 1 });

    // Movie 1 vs 2 in both dimensions
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 1,
      mediaBType: 'movie',
      mediaBId: 2,
      winnerType: 'movie',
      winnerId: 1,
    });

    // Exclude movie 1 from dim1 — it should still appear in overall via dim2
    excludeFromDimension('movie', 1, dim1);

    const result = await caller.media.comparisons.rankings({});
    // Movie 1 should still appear (has non-excluded score in dim2)
    expect(result.data.some((r) => r.mediaId === 1)).toBe(true);
    // Movie 2 should also appear
    expect(result.data.some((r) => r.mediaId === 2)).toBe(true);
  });
});

describe('comparisons auth', () => {
  it('rejects unauthenticated calls', async () => {
    const anonCaller = createCaller(false);
    await expect(anonCaller.media.comparisons.listDimensions()).rejects.toThrow(TRPCError);
  });
});

describe('blacklistMovie', () => {
  it('sets blacklisted=1 on matching watch_history rows', () => {
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 10 });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 10,
      watched_at: '2026-01-02T00:00:00Z',
    });

    const result = blacklistMovie('movie', 10);
    expect(result.blacklistedCount).toBe(2);

    const rows = db.prepare('SELECT blacklisted FROM watch_history WHERE media_id = 10').all() as {
      blacklisted: number;
    }[];
    expect(rows.every((r) => r.blacklisted === 1)).toBe(true);
  });

  it('does not blacklist unrelated movies', () => {
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 10 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 20 });

    blacklistMovie('movie', 10);

    const unrelated = db
      .prepare('SELECT blacklisted FROM watch_history WHERE media_id = 20')
      .get() as { blacklisted: number };
    expect(unrelated.blacklisted).toBe(0);
  });

  it('deletes all comparisons involving the blacklisted movie', async () => {
    const dimId = seedDimension(db, { name: 'Story' });

    // movie 10 vs 20, movie 10 vs 30, movie 20 vs 30
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 10,
      mediaBType: 'movie',
      mediaBId: 20,
      winnerType: 'movie',
      winnerId: 10,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 10,
      mediaBType: 'movie',
      mediaBId: 30,
      winnerType: 'movie',
      winnerId: 30,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 20,
      mediaBType: 'movie',
      mediaBId: 30,
      winnerType: 'movie',
      winnerId: 20,
    });

    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 10 });

    const result = blacklistMovie('movie', 10);
    expect(result.comparisonsDeleted).toBe(2); // 10v20 and 10v30

    // Only the 20v30 comparison remains
    const remaining = await caller.media.comparisons.listAll({});
    expect(remaining.pagination.total).toBe(1);
    expect(remaining.data[0]!.mediaAId).toBe(20);
    expect(remaining.data[0]!.mediaBId).toBe(30);
  });

  it('recalculates ELO for affected dimensions', async () => {
    const dimId = seedDimension(db, { name: 'Story' });

    // movie 10 beats 20, movie 20 beats 30
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 10,
      mediaBType: 'movie',
      mediaBId: 20,
      winnerType: 'movie',
      winnerId: 10,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 20,
      mediaBType: 'movie',
      mediaBId: 30,
      winnerType: 'movie',
      winnerId: 20,
    });

    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 10 });

    const result = blacklistMovie('movie', 10);
    expect(result.dimensionsRecalculated).toBe(1);

    // After blacklisting movie 10, only "20 beats 30" remains
    // Both should be recalculated from 1500: winner gets 1516, loser gets 1484
    const scores20 = await caller.media.comparisons.scores({ mediaType: 'movie', mediaId: 20 });
    const scores30 = await caller.media.comparisons.scores({ mediaType: 'movie', mediaId: 30 });
    expect(scores20.data[0]!.score).toBe(1516);
    expect(scores30.data[0]!.score).toBe(1484);
    expect(scores20.data[0]!.comparisonCount).toBe(1);

    // Movie 10 scores should be reset to 1500 with 0 comparisons
    const scores10 = await caller.media.comparisons.scores({ mediaType: 'movie', mediaId: 10 });
    expect(scores10.data[0]!.score).toBe(1500);
    expect(scores10.data[0]!.comparisonCount).toBe(0);
  });

  it('handles multiple dimensions', async () => {
    const dim1 = seedDimension(db, { name: 'Story' });
    const dim2 = seedDimension(db, { name: 'Visuals' });

    // Movie 10 vs 20 in both dimensions
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: 10,
      mediaBType: 'movie',
      mediaBId: 20,
      winnerType: 'movie',
      winnerId: 10,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: 10,
      mediaBType: 'movie',
      mediaBId: 20,
      winnerType: 'movie',
      winnerId: 20,
    });

    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 10 });

    const result = blacklistMovie('movie', 10);
    expect(result.comparisonsDeleted).toBe(2);
    expect(result.dimensionsRecalculated).toBe(2);

    // All comparisons gone
    const remaining = await caller.media.comparisons.listAll({});
    expect(remaining.pagination.total).toBe(0);
  });

  it('returns zero counts when movie has no watch history or comparisons', () => {
    const result = blacklistMovie('movie', 999);
    expect(result.blacklistedCount).toBe(0);
    expect(result.comparisonsDeleted).toBe(0);
    expect(result.dimensionsRecalculated).toBe(0);
  });

  it('is idempotent — re-blacklisting does not double-count', () => {
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 10 });

    const first = blacklistMovie('movie', 10);
    expect(first.blacklistedCount).toBe(1);

    const second = blacklistMovie('movie', 10);
    expect(second.blacklistedCount).toBe(0); // already blacklisted
  });
});

describe('comparisons.blacklistMovie (tRPC)', () => {
  it('calls service and returns counts via mutation', async () => {
    const dimId = seedDimension(db, { name: 'Story' });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: 10,
      mediaBType: 'movie',
      mediaBId: 20,
      winnerType: 'movie',
      winnerId: 10,
    });

    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 10 });

    const result = await caller.media.comparisons.blacklistMovie({
      mediaType: 'movie',
      mediaId: 10,
    });

    expect(result.data.blacklistedCount).toBe(1);
    expect(result.data.comparisonsDeleted).toBe(1);
    expect(result.data.dimensionsRecalculated).toBe(1);
    expect(result.message).toBe('Movie blacklisted and comparisons purged');
  });

  it('rejects unauthenticated calls', async () => {
    const anonCaller = createCaller(false);
    await expect(
      anonCaller.media.comparisons.blacklistMovie({ mediaType: 'movie', mediaId: 1 })
    ).rejects.toThrow(TRPCError);
  });
});

describe('dimension exclusion', () => {
  it('excludeFromDimension sets excluded=1 on media_scores', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });
    db.prepare(
      'INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('movie', movieId, dimId, 1600, 5, 0);

    excludeFromDimension('movie', movieId, dimId);

    const row = db
      .prepare(
        'SELECT excluded FROM media_scores WHERE media_type = ? AND media_id = ? AND dimension_id = ?'
      )
      .get('movie', movieId, dimId) as { excluded: number };
    expect(row.excluded).toBe(1);
  });

  it('excludeFromDimension creates score row with excluded=1 if missing', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });

    excludeFromDimension('movie', movieId, dimId);

    const row = db
      .prepare(
        'SELECT excluded, score FROM media_scores WHERE media_type = ? AND media_id = ? AND dimension_id = ?'
      )
      .get('movie', movieId, dimId) as { excluded: number; score: number };
    expect(row.excluded).toBe(1);
    expect(row.score).toBe(1500);
  });

  it('excludeFromDimension purges comparisons for that dimension only', () => {
    const dim1 = seedDimension(db, { name: 'Dim1' });
    const dim2 = seedDimension(db, { name: 'Dim2' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'Movie B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    db.prepare(
      'INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(dim1, 'movie', m1, 'movie', m2, 'movie', m1);
    db.prepare(
      'INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(dim2, 'movie', m1, 'movie', m2, 'movie', m1);

    excludeFromDimension('movie', m1, dim1);

    const dim1Count = db
      .prepare('SELECT COUNT(*) as c FROM comparisons WHERE dimension_id = ?')
      .get(dim1) as { c: number };
    const dim2Count = db
      .prepare('SELECT COUNT(*) as c FROM comparisons WHERE dimension_id = ?')
      .get(dim2) as { c: number };
    expect(dim1Count.c).toBe(0);
    expect(dim2Count.c).toBe(1); // dim2 untouched
  });

  it('excludeFromDimension recalculates ELO for affected dimension', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'Movie B' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Movie C' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m3, completed: 1 });

    for (const id of [m1, m2, m3]) {
      db.prepare(
        'INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('movie', id, dimId, 1500, 0, 0);
    }

    db.prepare(
      'INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(dimId, 'movie', m2, 'movie', m3, 'movie', m2);
    db.prepare(
      'INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(dimId, 'movie', m1, 'movie', m2, 'movie', m1);

    excludeFromDimension('movie', m1, dimId);

    const scores = db
      .prepare(
        'SELECT media_id, score FROM media_scores WHERE dimension_id = ? AND excluded = 0 ORDER BY score DESC'
      )
      .all(dimId) as Array<{ media_id: number; score: number }>;

    expect(scores.length).toBe(2);
    expect(scores[0]!.media_id).toBe(m2);
    expect(scores[0]!.score).toBeGreaterThan(scores[1]!.score);
  });

  it('includeInDimension sets excluded=0', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });
    db.prepare(
      'INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('movie', movieId, dimId, 1500, 0, 1);

    includeInDimension('movie', movieId, dimId);

    const row = db
      .prepare(
        'SELECT excluded FROM media_scores WHERE media_type = ? AND media_id = ? AND dimension_id = ?'
      )
      .get('movie', movieId, dimId) as { excluded: number };
    expect(row.excluded).toBe(0);
  });

  it('includeInDimension throws NOT_FOUND when no score row exists', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    expect(() => {
      includeInDimension('movie', 999, dimId);
    }).toThrow();
  });
});

describe('getDebriefOpponent', () => {
  function seedScore(
    rawDb: Database,
    mediaType: string,
    mediaId: number,
    dimensionId: number,
    score: number,
    excluded = 0
  ) {
    rawDb
      .prepare(
        'INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(mediaType, mediaId, dimensionId, score, 5, excluded);
  }

  it('selects movie closest to median score', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const debriefMovieId = seedMovie(db, { title: 'Debrief Movie', tmdb_id: 100 });
    const lowId = seedMovie(db, { title: 'Low Movie', tmdb_id: 101 });
    const midId = seedMovie(db, { title: 'Mid Movie', tmdb_id: 102 });
    const highId = seedMovie(db, { title: 'High Movie', tmdb_id: 103 });

    seedScore(db, 'movie', debriefMovieId, dimId, 1500);
    seedScore(db, 'movie', lowId, dimId, 1200);
    seedScore(db, 'movie', midId, dimId, 1500);
    seedScore(db, 'movie', highId, dimId, 1800);

    const result = getDebriefOpponent('movie', debriefMovieId, dimId);
    expect(result).not.toBeNull();
    // Median of [1200, 1500, 1800] (sorted, after excluding debrief) is 1500
    expect(result!.id).toBe(midId);
    expect(result!.title).toBe('Mid Movie');
  });

  it('excludes the debrief movie itself', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const debriefId = seedMovie(db, { title: 'Only Movie', tmdb_id: 200 });

    seedScore(db, 'movie', debriefId, dimId, 1500);

    const result = getDebriefOpponent('movie', debriefId, dimId);
    expect(result).toBeNull();
  });

  it('excludes movies with excluded=1 for the dimension', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const debriefId = seedMovie(db, { title: 'Debrief', tmdb_id: 300 });
    const excludedId = seedMovie(db, { title: 'Excluded', tmdb_id: 301 });

    seedScore(db, 'movie', debriefId, dimId, 1500);
    seedScore(db, 'movie', excludedId, dimId, 1500, 1); // excluded=1

    const result = getDebriefOpponent('movie', debriefId, dimId);
    expect(result).toBeNull();
  });

  it('excludes blacklisted movies', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const debriefId = seedMovie(db, { title: 'Debrief', tmdb_id: 400 });
    const blacklistedId = seedMovie(db, { title: 'Blacklisted', tmdb_id: 401 });

    seedScore(db, 'movie', debriefId, dimId, 1500);
    seedScore(db, 'movie', blacklistedId, dimId, 1500);
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: blacklistedId,
      blacklisted: 1,
    });

    const result = getDebriefOpponent('movie', debriefId, dimId);
    expect(result).toBeNull();
  });

  it('excludes movies already compared against in this dimension', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const debriefId = seedMovie(db, { title: 'Debrief', tmdb_id: 500 });
    const comparedId = seedMovie(db, { title: 'Compared', tmdb_id: 501 });

    seedScore(db, 'movie', debriefId, dimId, 1500);
    seedScore(db, 'movie', comparedId, dimId, 1500);

    // Insert a comparison between them
    db.prepare(
      'INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(dimId, 'movie', debriefId, 'movie', comparedId, 'movie', debriefId);

    const result = getDebriefOpponent('movie', debriefId, dimId);
    expect(result).toBeNull();
  });

  it('returns null when no eligible opponents exist', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const debriefId = seedMovie(db, { title: 'Debrief', tmdb_id: 600 });

    seedScore(db, 'movie', debriefId, dimId, 1500);
    // No other movies have scores

    const result = getDebriefOpponent('movie', debriefId, dimId);
    expect(result).toBeNull();
  });

  it('returns via tRPC endpoint', async () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const debriefId = seedMovie(db, { title: 'Debrief', tmdb_id: 700 });
    const opponentId = seedMovie(db, { title: 'Opponent', tmdb_id: 701 });

    seedScore(db, 'movie', debriefId, dimId, 1500);
    seedScore(db, 'movie', opponentId, dimId, 1500);

    const result = await caller.media.comparisons.getDebriefOpponent({
      mediaType: 'movie',
      mediaId: debriefId,
      dimensionId: dimId,
    });
    expect(result.data).not.toBeNull();
    expect(result.data!.id).toBe(opponentId);
    expect(result.data!.title).toBe('Opponent');
  });
});

describe('getPendingDebriefs', () => {
  function seedDebriefSession(
    rawDb: Database,
    watchHistoryId: number,
    status: string = 'pending'
  ): number {
    const result = rawDb
      .prepare('INSERT INTO debrief_sessions (watch_history_id, status) VALUES (?, ?)')
      .run(watchHistoryId, status);
    return Number(result.lastInsertRowid);
  }

  function seedDebriefResult(
    rawDb: Database,
    sessionId: number,
    dimensionId: number,
    comparisonId: number | null = null
  ) {
    rawDb
      .prepare(
        'INSERT INTO debrief_results (session_id, dimension_id, comparison_id) VALUES (?, ?, ?)'
      )
      .run(sessionId, dimensionId, comparisonId);
  }

  it('returns movies with pending debrief sessions', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const movieId = seedMovie(db, { title: 'Watched Movie', tmdb_id: 800 });
    const whId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      completed: 1,
    });
    seedDebriefSession(db, whId, 'pending');

    const results = getPendingDebriefs();
    expect(results).toHaveLength(1);
    expect(results[0]!.movieId).toBe(movieId);
    expect(results[0]!.title).toBe('Watched Movie');
    expect(results[0]!.status).toBe('pending');
    expect(results[0]!.pendingDimensionCount).toBe(1); // 1 active dim, 0 results
    void dimId;
  });

  it('excludes complete sessions', () => {
    const movieId = seedMovie(db, { title: 'Done Movie', tmdb_id: 801 });
    const whId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      completed: 1,
    });
    seedDebriefSession(db, whId, 'complete');

    const results = getPendingDebriefs();
    expect(results).toHaveLength(0);
  });

  it('includes active sessions', () => {
    const movieId = seedMovie(db, { title: 'Active Movie', tmdb_id: 802 });
    const whId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      completed: 1,
    });
    seedDebriefSession(db, whId, 'active');

    const results = getPendingDebriefs();
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('active');
  });

  it('counts pending dimensions correctly', () => {
    const dim1 = seedDimension(db, { name: 'Dim A' });
    const dim2 = seedDimension(db, { name: 'Dim B' });
    const movieId = seedMovie(db, { title: 'Partial Movie', tmdb_id: 803 });
    const whId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      completed: 1,
    });
    const sessionId = seedDebriefSession(db, whId, 'active');
    // Complete one dimension
    seedDebriefResult(db, sessionId, dim1, null);

    const results = getPendingDebriefs();
    expect(results).toHaveLength(1);
    // 2 active dims - 1 completed result = 1 pending
    expect(results[0]!.pendingDimensionCount).toBe(1);
    void dim2;
  });

  it('returns via tRPC endpoint', async () => {
    const movieId = seedMovie(db, { title: 'Debrief Via API', tmdb_id: 804 });
    const whId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      completed: 1,
    });
    seedDebriefSession(db, whId, 'pending');

    const result = await caller.media.comparisons.getPendingDebriefs();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.title).toBe('Debrief Via API');
  });
});

describe('getTierListMovies', () => {
  function seedScore(
    rawDb: Database,
    mediaId: number,
    dimensionId: number,
    score: number,
    comparisonCount: number = 5,
    excluded: number = 0
  ) {
    rawDb
      .prepare(
        'INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run('movie', mediaId, dimensionId, score, comparisonCount, excluded);
  }

  it('returns movies for a dimension', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { title: 'Movie A', tmdb_id: 900 });
    const m2 = seedMovie(db, { title: 'Movie B', tmdb_id: 901 });

    seedScore(db, m1, dimId, 1600, 3);
    seedScore(db, m2, dimId, 1400, 5);

    const results = getTierListMovies(dimId);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toContain(m1);
    expect(results.map((r) => r.id)).toContain(m2);
  });

  it('excludes movies with excluded=1', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const m1 = seedMovie(db, { title: 'Included', tmdb_id: 910 });
    const m2 = seedMovie(db, { title: 'Excluded', tmdb_id: 911 });

    seedScore(db, m1, dimId, 1500, 5);
    seedScore(db, m2, dimId, 1500, 5, 1); // excluded

    const results = getTierListMovies(dimId);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(m1);
  });

  it('excludes blacklisted movies', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const m1 = seedMovie(db, { title: 'Normal', tmdb_id: 920 });
    const m2 = seedMovie(db, { title: 'Blacklisted', tmdb_id: 921 });

    seedScore(db, m1, dimId, 1500, 5);
    seedScore(db, m2, dimId, 1500, 5);
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, blacklisted: 1 });

    const results = getTierListMovies(dimId);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(m1);
  });

  it('excludes movies with staleness below threshold', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const m1 = seedMovie(db, { title: 'Fresh', tmdb_id: 930 });
    const m2 = seedMovie(db, { title: 'Stale', tmdb_id: 931 });

    seedScore(db, m1, dimId, 1500, 5);
    seedScore(db, m2, dimId, 1500, 5);
    // Mark m2 as very stale
    db.prepare(
      'INSERT INTO comparison_staleness (media_type, media_id, staleness) VALUES (?, ?, ?)'
    ).run('movie', m2, 0.1);

    const results = getTierListMovies(dimId);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(m1);
  });

  it('returns at most 8 movies', () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    for (let i = 0; i < 12; i++) {
      const mid = seedMovie(db, { title: `Movie ${i}`, tmdb_id: 940 + i });
      seedScore(db, mid, dimId, 1400 + i * 50, i + 1);
    }

    const results = getTierListMovies(dimId);
    expect(results.length).toBeLessThanOrEqual(8);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty array when no eligible movies', () => {
    const dimId = seedDimension(db, { name: 'Empty Dim' });
    const results = getTierListMovies(dimId);
    expect(results).toHaveLength(0);
  });

  it('returns via tRPC endpoint', async () => {
    const dimId = seedDimension(db, { name: 'API Dim' });
    const m1 = seedMovie(db, { title: 'API Movie', tmdb_id: 960 });
    seedScore(db, m1, dimId, 1500, 5);

    const result = await caller.media.comparisons.getTierListMovies({
      dimensionId: dimId,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.title).toBe('API Movie');
    expect(result.data[0]!.score).toBe(1500);
  });
});

describe('batchRecordComparisons', () => {
  it('records multiple comparisons in a single batch', () => {
    const dimId = seedDimension(db, { name: 'Batch Dim' });
    const m1 = seedMovie(db, { title: 'Batch A', tmdb_id: 970 });
    const m2 = seedMovie(db, { title: 'Batch B', tmdb_id: 971 });
    const m3 = seedMovie(db, { title: 'Batch C', tmdb_id: 972 });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m1,
      watched_at: '2025-01-01T00:00:00Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m2,
      watched_at: '2025-01-02T00:00:00Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m3,
      watched_at: '2025-01-03T00:00:00Z',
    });

    const result = batchRecordComparisons(dimId, [
      {
        mediaAType: 'movie',
        mediaAId: m1,
        mediaBType: 'movie',
        mediaBId: m2,
        winnerType: 'movie',
        winnerId: m1,
      },
      {
        mediaAType: 'movie',
        mediaAId: m2,
        mediaBType: 'movie',
        mediaBId: m3,
        winnerType: 'movie',
        winnerId: m3,
      },
    ]);

    expect(result.count).toBe(2);

    // Verify comparisons were inserted
    const rows = db
      .prepare('SELECT COUNT(*) as cnt FROM comparisons WHERE dimension_id = ?')
      .get(dimId) as { cnt: number };
    expect(rows.cnt).toBe(2);
  });

  it('updates ELO scores for all comparisons', () => {
    const dimId = seedDimension(db, { name: 'ELO Dim' });
    const m1 = seedMovie(db, { title: 'ELO A', tmdb_id: 975 });
    const m2 = seedMovie(db, { title: 'ELO B', tmdb_id: 976 });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m1,
      watched_at: '2025-02-01T00:00:00Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m2,
      watched_at: '2025-02-02T00:00:00Z',
    });

    batchRecordComparisons(dimId, [
      {
        mediaAType: 'movie',
        mediaAId: m1,
        mediaBType: 'movie',
        mediaBId: m2,
        winnerType: 'movie',
        winnerId: m1,
      },
    ]);

    // Winner should have score > 1500, loser < 1500
    const scores = db
      .prepare('SELECT media_id, score FROM media_scores WHERE dimension_id = ? ORDER BY media_id')
      .all(dimId) as Array<{ media_id: number; score: number }>;

    const winnerScore = scores.find((s) => s.media_id === m1)?.score ?? 0;
    const loserScore = scores.find((s) => s.media_id === m2)?.score ?? 0;
    expect(winnerScore).toBeGreaterThan(1500);
    expect(loserScore).toBeLessThan(1500);
  });

  it('records draws with correct drawTier', () => {
    const dimId = seedDimension(db, { name: 'Draw Dim' });
    const m1 = seedMovie(db, { title: 'Draw A', tmdb_id: 980 });
    const m2 = seedMovie(db, { title: 'Draw B', tmdb_id: 981 });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m1,
      watched_at: '2025-03-01T00:00:00Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m2,
      watched_at: '2025-03-02T00:00:00Z',
    });

    const result = batchRecordComparisons(dimId, [
      {
        mediaAType: 'movie',
        mediaAId: m1,
        mediaBType: 'movie',
        mediaBId: m2,
        winnerType: 'movie',
        winnerId: 0,
        drawTier: 'high',
      },
    ]);

    expect(result.count).toBe(1);
    const row = db
      .prepare('SELECT draw_tier FROM comparisons WHERE dimension_id = ?')
      .get(dimId) as { draw_tier: string };
    expect(row.draw_tier).toBe('high');
  });

  it('throws for inactive dimension', () => {
    const dimId = seedDimension(db, { name: 'Inactive', active: 0 });
    const m1 = seedMovie(db, { title: 'Err A', tmdb_id: 985 });
    const m2 = seedMovie(db, { title: 'Err B', tmdb_id: 986 });

    expect(() =>
      batchRecordComparisons(dimId, [
        {
          mediaAType: 'movie',
          mediaAId: m1,
          mediaBType: 'movie',
          mediaBId: m2,
          winnerType: 'movie',
          winnerId: m1,
        },
      ])
    ).toThrow();
  });

  it('rolls back all on failure (non-existent dimension)', () => {
    expect(() =>
      batchRecordComparisons(99999, [
        {
          mediaAType: 'movie',
          mediaAId: 1,
          mediaBType: 'movie',
          mediaBId: 2,
          winnerType: 'movie',
          winnerId: 1,
        },
      ])
    ).toThrow();

    const rows = db
      .prepare('SELECT COUNT(*) as cnt FROM comparisons WHERE dimension_id = 99999')
      .get() as { cnt: number };
    expect(rows.cnt).toBe(0);
  });

  it('works via tRPC endpoint', async () => {
    const dimId = seedDimension(db, { name: 'tRPC Batch Dim' });
    const m1 = seedMovie(db, { title: 'tRPC A', tmdb_id: 990 });
    const m2 = seedMovie(db, { title: 'tRPC B', tmdb_id: 991 });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m1,
      watched_at: '2025-04-01T00:00:00Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m2,
      watched_at: '2025-04-02T00:00:00Z',
    });

    const result = await caller.media.comparisons.batchRecordComparisons({
      dimensionId: dimId,
      comparisons: [
        {
          mediaAType: 'movie',
          mediaAId: m1,
          mediaBType: 'movie',
          mediaBId: m2,
          winnerType: 'movie',
          winnerId: m1,
        },
      ],
    });

    expect(result.data.count).toBe(1);
    expect(result.message).toBe('1 comparisons recorded');
  });
});
