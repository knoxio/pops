import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';

import type { Database } from 'better-sqlite3';

import type { createCaller } from '../../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

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
    .run(mediaType, mediaId, dimensionId, score, 0, excluded);
}

function seedComparison(
  rawDb: Database,
  dimensionId: number,
  mediaAId: number,
  mediaBId: number,
  winnerId: number
) {
  rawDb
    .prepare(
      'INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(dimensionId, 'movie', mediaAId, 'movie', mediaBId, 'movie', winnerId);
}

describe('dimension exclusion — integration (tRPC)', () => {
  it('excludeFromDimension returns comparisonsDeleted count', async () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'Movie B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });
    seedScore(db, 'movie', m1, dimId, 1500);
    seedScore(db, 'movie', m2, dimId, 1500);
    seedComparison(db, dimId, m1, m2, m1);
    seedComparison(db, dimId, m2, m1, m1);

    const result = await caller.media.comparisons.excludeFromDimension({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });

    expect(result.comparisonsDeleted).toBe(2);
  });

  it('excludeFromDimension returns 0 when no comparisons exist', async () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });

    const result = await caller.media.comparisons.excludeFromDimension({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });

    expect(result.comparisonsDeleted).toBe(0);
  });

  it('exclude → rankings omit movie → include → rankings restore movie', async () => {
    const dimId = seedDimension(db, { name: 'Dim' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'Movie B' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Movie C' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m3, completed: 1 });
    seedScore(db, 'movie', m1, dimId, 1600);
    seedScore(db, 'movie', m2, dimId, 1500);
    seedScore(db, 'movie', m3, dimId, 1400);

    // Verify all 3 in rankings before exclusion
    const beforeRankings = await caller.media.comparisons.rankings({ dimensionId: dimId });
    expect(beforeRankings.data).toHaveLength(3);

    // Exclude movie m1
    await caller.media.comparisons.excludeFromDimension({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });

    // Rankings should omit m1
    const afterExclude = await caller.media.comparisons.rankings({ dimensionId: dimId });
    const excludedIds = afterExclude.data.map((r) => r.mediaId);
    expect(excludedIds).not.toContain(m1);
    expect(afterExclude.data).toHaveLength(2);

    // Include m1 back
    await caller.media.comparisons.includeInDimension({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dimId,
    });

    // Rankings should restore m1
    const afterInclude = await caller.media.comparisons.rankings({ dimensionId: dimId });
    const restoredIds = afterInclude.data.map((r) => r.mediaId);
    expect(restoredIds).toContain(m1);
    expect(afterInclude.data).toHaveLength(3);
  });

  it('excludeFromDimension purges comparisons for target dimension only', async () => {
    const dim1 = seedDimension(db, { name: 'Dim1' });
    const dim2 = seedDimension(db, { name: 'Dim2' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Movie A' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'Movie B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });
    seedScore(db, 'movie', m1, dim1, 1500);
    seedScore(db, 'movie', m2, dim1, 1500);
    seedScore(db, 'movie', m1, dim2, 1500);
    seedScore(db, 'movie', m2, dim2, 1500);
    seedComparison(db, dim1, m1, m2, m1);
    seedComparison(db, dim2, m1, m2, m1);

    const result = await caller.media.comparisons.excludeFromDimension({
      mediaType: 'movie',
      mediaId: m1,
      dimensionId: dim1,
    });

    expect(result.comparisonsDeleted).toBe(1);

    // dim2 comparisons untouched
    const dim2Count = db
      .prepare('SELECT COUNT(*) as c FROM comparisons WHERE dimension_id = ?')
      .get(dim2) as { c: number };
    expect(dim2Count.c).toBe(1);
  });

  it('includeInDimension throws NOT_FOUND via tRPC when no score row', async () => {
    const dimId = seedDimension(db, { name: 'Dim' });

    await expect(
      caller.media.comparisons.includeInDimension({
        mediaType: 'movie',
        mediaId: 999,
        dimensionId: dimId,
      })
    ).rejects.toThrow(TRPCError);
  });

  it('excludeFromDimension throws NOT_FOUND via tRPC for invalid dimension', async () => {
    await expect(
      caller.media.comparisons.excludeFromDimension({
        mediaType: 'movie',
        mediaId: 1,
        dimensionId: 99999,
      })
    ).rejects.toThrow(TRPCError);
  });
});
