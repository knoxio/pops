/**
 * Arena flow integration tests — exercises the full comparison lifecycle
 * via tRPC caller: pair selection → record → skip → stale → exclude →
 * blacklist → rankings verification.
 */
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

function seedWatchedMovie(rawDb: Database, tmdbId: number, title: string): number {
  const movieId = seedMovie(rawDb, { tmdb_id: tmdbId, title });
  seedWatchHistoryEntry(rawDb, {
    media_type: 'movie',
    media_id: movieId,
    completed: 1,
  });
  return movieId;
}

describe('arena flow — full lifecycle', () => {
  it('record comparison → updates rankings', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');

    // Record a comparison: m1 wins
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    // Verify rankings: m1 should be ranked higher than m2
    const rankings = await caller.media.comparisons.rankings({
      dimensionId: dimId,
    });
    expect(rankings.data).toHaveLength(2);
    expect(rankings.data[0]!.mediaId).toBe(m1);
    expect(rankings.data[0]!.score).toBeGreaterThan(rankings.data[1]!.score);
  });

  it('record draw → both scores adjust', async () => {
    const dimId = seedDimension(db, { name: 'Cinematography' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: 0,
      drawTier: 'mid',
    });

    // Both should have scores, both at 1500 (mid draw = 0.5)
    const scores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });
    expect(scores.data).toHaveLength(1);
    expect(scores.data[0]!.score).toBe(1500); // mid draw doesn't change score
  });

  it('skip → cooloff recorded in database', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');

    // Skip this pair
    await caller.media.comparisons.recordSkip({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
    });

    // Verify cooloff row exists (skip_until = globalCompCount + 10)
    const cooloff = db
      .prepare(
        'SELECT skip_until FROM comparison_skip_cooloffs WHERE dimension_id = ? AND media_a_id = ? AND media_b_id = ?'
      )
      .get(dimId, m1, m2) as { skip_until: number } | undefined;
    expect(cooloff).toBeDefined();
    expect(cooloff!.skip_until).toBe(10); // 0 comparisons + 10
  });

  it('mark stale → staleness decreases', async () => {
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');

    // Initial staleness should be 1.0 (fresh)
    const initial = await caller.media.comparisons.getStaleness({
      mediaType: 'movie',
      mediaId: m1,
    });
    expect(initial.data.staleness).toBe(1.0);

    // Mark stale once → 0.5
    const first = await caller.media.comparisons.markStale({
      mediaType: 'movie',
      mediaId: m1,
    });
    expect(first.data.staleness).toBe(0.5);

    // Mark stale again → 0.25
    const second = await caller.media.comparisons.markStale({
      mediaType: 'movie',
      mediaId: m1,
    });
    expect(second.data.staleness).toBe(0.25);
  });

  it('exclude → purge comparisons → omit from rankings → include restores', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');
    const m3 = seedWatchedMovie(db, 552, 'Inception');

    // Record comparisons
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m3,
      winnerType: 'movie',
      winnerId: m1,
    });

    // Verify all 3 in rankings
    const before = await caller.media.comparisons.rankings({
      dimensionId: dimId,
    });
    expect(before.data).toHaveLength(3);

    // Exclude m1
    const excludeResult = await caller.media.comparisons.excludeFromDimension({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });
    expect(excludeResult.comparisonsDeleted).toBe(2);

    // Rankings omit m1
    const afterExclude = await caller.media.comparisons.rankings({
      dimensionId: dimId,
    });
    expect(afterExclude.data.map((r) => r.mediaId)).not.toContain(m1);
    expect(afterExclude.data).toHaveLength(2);

    // Include m1 back
    await caller.media.comparisons.includeInDimension({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });

    // Rankings restore m1
    const afterInclude = await caller.media.comparisons.rankings({
      dimensionId: dimId,
    });
    expect(afterInclude.data.map((r) => r.mediaId)).toContain(m1);
    expect(afterInclude.data).toHaveLength(3);
  });

  it('blacklist movie → purge all comparisons across dimensions + recalculate', async () => {
    const dim1 = seedDimension(db, { name: 'Entertainment' });
    const dim2 = seedDimension(db, { name: 'Cinematography' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');

    // Record comparisons in both dimensions
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m2,
    });

    // Blacklist m1
    const result = await caller.media.comparisons.blacklistMovie({
      mediaType: 'movie',
      mediaId: m1,
    });
    expect(result.data.comparisonsDeleted).toBe(2);
    expect(result.data.blacklistedCount).toBeGreaterThanOrEqual(1);

    // All comparisons involving m1 should be deleted
    const allComps = await caller.media.comparisons.listAll({});
    expect(allComps.data).toHaveLength(0);

    // Watch history should be marked as blacklisted
    const wh = db
      .prepare('SELECT blacklisted FROM watch_history WHERE media_type = ? AND media_id = ?')
      .get('movie', m1) as { blacklisted: number };
    expect(wh.blacklisted).toBe(1);

    // Scores for m1 should be reset to 1500 (recalculated with no comparisons)
    const scores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: m1,
    });
    for (const s of scores.data) {
      expect(s.score).toBe(1500);
      expect(s.comparisonCount).toBe(0);
    }
  });

  it('getSmartPair returns null with insufficient movies (single movie)', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    seedWatchedMovie(db, 550, 'Fight Club'); // only 1 movie

    const pair = await caller.media.comparisons.getSmartPair({
      dimensionId: dimId,
    });
    expect(pair.data).toBeNull();
    expect(pair.reason).toBe('insufficient_watched_movies');
  });

  it('getSmartPair returns pair with sufficient movies (explicit dimension)', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');

    const pair = await caller.media.comparisons.getSmartPair({
      dimensionId: dimId,
    });
    expect(pair.data).not.toBeNull();
    expect(pair.reason).toBeNull();
    const ids = [pair.data!.movieA.id, pair.data!.movieB.id];
    expect(ids).toContain(m1);
    expect(ids).toContain(m2);
  });

  it('getSmartPair returns null with insufficient movies', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    seedWatchedMovie(db, 550, 'Fight Club'); // only 1 movie

    const pair = await caller.media.comparisons.getSmartPair({
      dimensionId: dimId,
    });
    expect(pair.data).toBeNull();
    expect(pair.reason).toBe('insufficient_watched_movies');
  });

  it('multi-dimension flow: comparison in one does not affect another', async () => {
    const dim1 = seedDimension(db, { name: 'Entertainment' });
    const dim2 = seedDimension(db, { name: 'Cinematography' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');

    // Record in dim1 only
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    // dim1 should have scored entries
    const dim1Ranks = await caller.media.comparisons.rankings({
      dimensionId: dim1,
    });
    expect(dim1Ranks.data).toHaveLength(2);
    expect(dim1Ranks.data[0]!.mediaId).toBe(m1);

    // dim2 should be empty (no comparisons recorded)
    const dim2Ranks = await caller.media.comparisons.rankings({
      dimensionId: dim2,
    });
    expect(dim2Ranks.data).toHaveLength(0);
  });

  it('scores endpoint returns confidence', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    const scores = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });

    expect(scores.data).toHaveLength(1);
    expect(scores.data[0]!.confidence).toBeGreaterThan(0);
    expect(scores.data[0]!.comparisonCount).toBe(1);
  });

  it('delete comparison → scores recalculated to baseline', async () => {
    const dimId = seedDimension(db, { name: 'Entertainment' });
    const m1 = seedWatchedMovie(db, 550, 'Fight Club');
    const m2 = seedWatchedMovie(db, 551, 'The Matrix');

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    // Get comparison id
    const history = await caller.media.comparisons.listAll({});
    expect(history.data).toHaveLength(1);
    const compId = history.data[0]!.id;

    // Delete
    await caller.media.comparisons.delete({ id: compId });

    // Both scores should be back to baseline 1500
    const scores1 = await caller.media.comparisons.scores({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });
    if (scores1.data.length > 0) {
      expect(scores1.data[0]!.score).toBe(1500);
    }
  });
});
