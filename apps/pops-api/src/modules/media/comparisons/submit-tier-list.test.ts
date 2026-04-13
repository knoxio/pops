import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';
import { recordComparison, submitTierList } from './service.js';
import { getTierOverrideForMedia } from './tier-overrides.js';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

/** Seed a movie and mark it as watched so it's eligible for comparisons. */
function seedWatchedMovie(tmdbId: number, title: string): number {
  const movieId = seedMovie(db, {
    tmdb_id: tmdbId,
    title,
    poster_path: `/${title.toLowerCase()}.jpg`,
  });
  seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieId });
  return movieId;
}

/** Seed a raw comparison row directly for test setup. */
function seedComparison(
  dimId: number,
  aId: number,
  bId: number,
  winnerId: number,
  source: string | null = null
): number {
  const result = db
    .prepare(
      `INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id, source)
       VALUES (?, 'movie', ?, 'movie', ?, 'movie', ?, ?)`
    )
    .run(dimId, aId, bId, winnerId, source);
  return Number(result.lastInsertRowid);
}

/** Count comparisons for a dimension. */
function countComparisons(dimId: number): number {
  return (
    db.prepare(`SELECT COUNT(*) as cnt FROM comparisons WHERE dimension_id = ?`).get(dimId) as {
      cnt: number;
    }
  ).cnt;
}

/** Get a comparison row by id. */
function getComparison(id: number) {
  return db.prepare(`SELECT * FROM comparisons WHERE id = ?`).get(id) as Record<string, unknown>;
}

describe('submitTierList', () => {
  it('records correct number of pairwise comparisons', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');
    const m3 = seedWatchedMovie(102, 'Movie C');

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'A' },
        { movieId: m3, tier: 'B' },
      ],
    });

    // 3 movies → 3*(3-1)/2 = 3 pairwise comparisons
    expect(result.comparisonsRecorded).toBe(3);
    expect(result.scoreChanges).toHaveLength(3);
  });

  it('records n*(n-1)/2 comparisons for 4 movies', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');
    const m3 = seedWatchedMovie(102, 'Movie C');
    const m4 = seedWatchedMovie(103, 'Movie D');

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'A' },
        { movieId: m3, tier: 'C' },
        { movieId: m4, tier: 'D' },
      ],
    });

    // 4 movies → 4*3/2 = 6 pairwise comparisons
    expect(result.comparisonsRecorded).toBe(6);
  });

  it('higher tier movie gets higher score after submission', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Top Movie');
    const m2 = seedWatchedMovie(101, 'Bottom Movie');

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'D' },
      ],
    });

    const topChange = result.scoreChanges.find((s) => s.movieId === m1);
    const bottomChange = result.scoreChanges.find((s) => s.movieId === m2);

    expect(topChange?.newScore).toBeDefined();
    expect(bottomChange?.newScore).toBeDefined();
    expect((topChange?.newScore ?? 0) > (bottomChange?.newScore ?? 0)).toBe(true);
  });

  it('same-tier movies get draw comparisons', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'A' },
        { movieId: m2, tier: 'A' },
      ],
    });

    expect(result.comparisonsRecorded).toBe(1);

    // Both should have equal or near-equal scores (mid draw = 0.5)
    const s1 = result.scoreChanges.find((s) => s.movieId === m1);
    const s2 = result.scoreChanges.find((s) => s.movieId === m2);
    expect(s1?.newScore).toBeDefined();
    expect(s2?.newScore).toBeDefined();
    expect(Math.abs((s1?.newScore ?? 0) - (s2?.newScore ?? 0))).toBeLessThan(1);
  });

  it('sets tier overrides for each placement', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'C' },
      ],
    });

    const override1 = getTierOverrideForMedia('movie', m1, dimId);
    const override2 = getTierOverrideForMedia('movie', m2, dimId);

    expect(override1?.tier).toBe('S');
    expect(override2?.tier).toBe('C');
  });

  it('rejects inactive dimension', () => {
    const dimId = seedDimension(db, { name: 'Inactive', active: 0 });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    expect(() =>
      submitTierList({
        dimensionId: dimId,
        placements: [
          { movieId: m1, tier: 'S' },
          { movieId: m2, tier: 'A' },
        ],
      })
    ).toThrow('Validation failed');
  });

  it('rejects non-existent dimension', () => {
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    expect(() =>
      submitTierList({
        dimensionId: 999,
        placements: [
          { movieId: m1, tier: 'S' },
          { movieId: m2, tier: 'A' },
        ],
      })
    ).toThrow();
  });

  it('returns score changes for all placed movies', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'D' },
      ],
    });

    expect(result.scoreChanges).toHaveLength(2);
    for (const change of result.scoreChanges) {
      expect(change.oldScore).toBe(1500.0);
      expect(change.movieId).toBeGreaterThan(0);
    }
  });

  it('sets source to tier_list on all recorded comparisons', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'D' },
      ],
    });

    const rows = db
      .prepare(`SELECT source FROM comparisons WHERE dimension_id = ?`)
      .all(dimId) as Array<{ source: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe('tier_list');
  });
});

describe('submitTierList — override/skip dedup', () => {
  it('overrides null-source comparison with tier_list', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    // Seed a null-source comparison
    seedComparison(dimId, m1, m2, m1, null);
    expect(countComparisons(dimId)).toBe(1);

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'D' },
      ],
    });

    expect(result.comparisonsRecorded).toBe(1);
    expect(result.skipped).toBe(0);
    // Should still be 1 comparison (old deleted, new inserted)
    expect(countComparisons(dimId)).toBe(1);
    const rows = db
      .prepare(`SELECT source FROM comparisons WHERE dimension_id = ?`)
      .all(dimId) as Array<{ source: string | null }>;
    expect(rows[0]!.source).toBe('tier_list');
  });

  it('overrides tier_list with tier_list (latest opinion wins)', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    // First tier list submission
    submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'D' },
      ],
    });
    expect(countComparisons(dimId)).toBe(1);

    // Second submission with reversed tiers
    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'D' },
        { movieId: m2, tier: 'S' },
      ],
    });

    expect(result.comparisonsRecorded).toBe(1);
    expect(result.skipped).toBe(0);
    expect(countComparisons(dimId)).toBe(1);
  });

  it('skips tier_list when arena comparison exists', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    // Seed an arena comparison
    seedComparison(dimId, m1, m2, m1, 'arena');
    const origRow = db
      .prepare(`SELECT * FROM comparisons WHERE dimension_id = ?`)
      .get(dimId) as Record<string, unknown>;

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'D' },
        { movieId: m2, tier: 'S' },
      ],
    });

    expect(result.comparisonsRecorded).toBe(0);
    expect(result.skipped).toBe(1);
    // Arena comparison should be preserved
    expect(countComparisons(dimId)).toBe(1);
    const preserved = getComparison(origRow.id as number);
    expect(preserved.source).toBe('arena');
  });

  it('returns skipped count reflecting skipped pairs', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');
    const m3 = seedWatchedMovie(102, 'Movie C');

    // Seed arena comparison for m1 vs m2 only
    seedComparison(dimId, m1, m2, m1, 'arena');

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: 'S' },
        { movieId: m2, tier: 'A' },
        { movieId: m3, tier: 'B' },
      ],
    });

    // 3 pairs total: m1-m2 (skipped), m1-m3 (recorded), m2-m3 (recorded)
    expect(result.skipped).toBe(1);
    expect(result.comparisonsRecorded).toBe(2);
  });
});

describe('recordComparison — override/skip dedup', () => {
  it('overrides tier_list comparison with arena', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    // Seed tier_list comparison
    seedComparison(dimId, m1, m2, m1, 'tier_list');

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m2,
    });

    expect(row.source).toBe('arena');
    expect(countComparisons(dimId)).toBe(1);
  });

  it('overrides arena with arena (latest opinion wins)', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    // Seed arena comparison where m1 wins
    seedComparison(dimId, m1, m2, m1, 'arena');

    // New arena comparison where m2 wins
    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m2,
    });

    expect(row.source).toBe('arena');
    expect(row.winnerId).toBe(m2);
    expect(countComparisons(dimId)).toBe(1);
  });

  it('overrides null-source comparison with arena', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    seedComparison(dimId, m1, m2, m1, null);

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m2,
    });

    expect(row.source).toBe('arena');
    expect(countComparisons(dimId)).toBe(1);
  });

  it('finds existing comparison regardless of A/B ordering', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedWatchedMovie(100, 'Movie A');
    const m2 = seedWatchedMovie(101, 'Movie B');

    // Seed comparison as (m2, m1) — reversed order
    seedComparison(dimId, m2, m1, m2, 'tier_list');

    // Record as (m1, m2) — should still find and override
    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    expect(row.source).toBe('arena');
    expect(countComparisons(dimId)).toBe(1);
  });
});
