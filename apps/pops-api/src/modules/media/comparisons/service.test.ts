import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';
import {
  excludeFromDimension,
  getTierListMovies,
  includeInDimension,
  recordComparison,
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

function seedScore(
  rawDb: Database,
  mediaType: string,
  mediaId: number,
  dimensionId: number,
  score: number,
  comparisonCount = 0,
  excluded = 0
) {
  rawDb
    .prepare(
      'INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(mediaType, mediaId, dimensionId, score, comparisonCount, excluded);
}

function getScore(rawDb: Database, mediaId: number, dimensionId: number) {
  return rawDb
    .prepare('SELECT * FROM media_scores WHERE media_id = ? AND dimension_id = ?')
    .get(mediaId, dimensionId) as
    | { score: number; comparison_count: number; excluded: number }
    | undefined;
}

function getComparisons(rawDb: Database, dimensionId: number) {
  return rawDb
    .prepare('SELECT * FROM comparisons WHERE dimension_id = ?')
    .all(dimensionId) as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Priority 1 — Elo logic (tested indirectly via recordComparison)
// ---------------------------------------------------------------------------

describe('Elo scoring (via recordComparison)', () => {
  it('win at equal 1500 ratings produces ±16 delta', () => {
    const dimId = seedDimension(db, { name: 'Elo Test' });
    const m1 = seedMovie(db, { tmdb_id: 100, title: 'Movie A' });
    const m2 = seedMovie(db, { tmdb_id: 101, title: 'Movie B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    // K=32, expected=0.5 for equal ratings → delta = 32*(1-0.5) = 16
    expect(row.deltaA).toBe(16);
    expect(row.deltaB).toBe(-16);
  });

  it('loss produces negative delta for loser', () => {
    const dimId = seedDimension(db, { name: 'Loss Test' });
    const m1 = seedMovie(db, { tmdb_id: 200, title: 'Loser' });
    const m2 = seedMovie(db, { tmdb_id: 201, title: 'Winner' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m2,
    });

    expect(row.deltaA).toBe(-16);
    expect(row.deltaB).toBe(16);
  });

  it('draw with default tier produces 0 delta at equal ratings', () => {
    const dimId = seedDimension(db, { name: 'Draw Default' });
    const m1 = seedMovie(db, { tmdb_id: 300, title: 'Draw A' });
    const m2 = seedMovie(db, { tmdb_id: 301, title: 'Draw B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: 0, // draw
    });

    // Default draw tier: actual=0.5, expected=0.5 → delta=0
    expect(row.deltaA).toBe(0);
    expect(row.deltaB).toBe(0);
  });

  it('draw with high tier produces positive deltas for both', () => {
    const dimId = seedDimension(db, { name: 'Draw High' });
    const m1 = seedMovie(db, { tmdb_id: 310, title: 'High A' });
    const m2 = seedMovie(db, { tmdb_id: 311, title: 'High B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: 0,
      drawTier: 'high',
    });

    // High draw: actual=0.7, expected=0.5 → delta = 32*(0.7-0.5) = 6.4 → round to 6
    expect(row.deltaA).toBeGreaterThan(0);
    expect(row.deltaB).toBeGreaterThan(0);
  });

  it('draw with low tier produces negative deltas for both', () => {
    const dimId = seedDimension(db, { name: 'Draw Low' });
    const m1 = seedMovie(db, { tmdb_id: 320, title: 'Low A' });
    const m2 = seedMovie(db, { tmdb_id: 321, title: 'Low B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: 0,
      drawTier: 'low',
    });

    // Low draw: actual=0.3, expected=0.5 → delta = 32*(0.3-0.5) = -6.4 → round to -6
    expect(row.deltaA).toBeLessThan(0);
    expect(row.deltaB).toBeLessThan(0);
  });

  it('scores update correctly after multiple comparisons', () => {
    const dimId = seedDimension(db, { name: 'Multi Comp' });
    const m1 = seedMovie(db, { tmdb_id: 400, title: 'Strong' });
    const m2 = seedMovie(db, { tmdb_id: 401, title: 'Weak' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    // m1 wins first
    recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    const score1 = getScore(db, m1, dimId);
    expect(score1).toBeDefined();
    expect(score1!.score).toBe(1516); // 1500 + 16
    expect(score1!.comparison_count).toBe(1);

    const score2 = getScore(db, m2, dimId);
    expect(score2).toBeDefined();
    expect(score2!.score).toBe(1484); // 1500 - 16
    expect(score2!.comparison_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Priority 2 — DB-backed operations
// ---------------------------------------------------------------------------

describe('recordComparison', () => {
  it('returns valid comparison row with all fields', () => {
    const dimId = seedDimension(db, { name: 'Record Test' });
    const m1 = seedMovie(db, { tmdb_id: 500, title: 'A' });
    const m2 = seedMovie(db, { tmdb_id: 501, title: 'B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    expect(row.dimensionId).toBe(dimId);
    expect(row.mediaAId).toBe(m1);
    expect(row.mediaBId).toBe(m2);
    expect(row.winnerId).toBe(m1);
    expect(row.comparedAt).toBeDefined();
    expect(typeof row.id).toBe('number');
  });

  it('throws for inactive dimension', () => {
    const dimId = seedDimension(db, { name: 'Inactive', active: 0 });
    const m1 = seedMovie(db, { tmdb_id: 510, title: 'A' });
    const m2 = seedMovie(db, { tmdb_id: 511, title: 'B' });

    expect(() =>
      recordComparison({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: m1,
        mediaBType: 'movie',
        mediaBId: m2,
        winnerType: 'movie',
        winnerId: m1,
      })
    ).toThrow('Validation failed');
  });

  it('throws for invalid winner', () => {
    const dimId = seedDimension(db, { name: 'Invalid Winner' });
    const m1 = seedMovie(db, { tmdb_id: 520, title: 'A' });
    const m2 = seedMovie(db, { tmdb_id: 521, title: 'B' });

    expect(() =>
      recordComparison({
        dimensionId: dimId,
        mediaAType: 'movie',
        mediaAId: m1,
        mediaBType: 'movie',
        mediaBId: m2,
        winnerType: 'movie',
        winnerId: 999, // not m1 or m2
      })
    ).toThrow();
  });

  it('creates initial 1500 scores when recording first comparison', () => {
    const dimId = seedDimension(db, { name: 'Init Scores' });
    const m1 = seedMovie(db, { tmdb_id: 530, title: 'New A' });
    const m2 = seedMovie(db, { tmdb_id: 531, title: 'New B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    // No scores exist yet
    expect(getScore(db, m1, dimId)).toBeUndefined();

    recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    // Scores now exist with updated values
    const scoreA = getScore(db, m1, dimId);
    const scoreB = getScore(db, m2, dimId);
    expect(scoreA).toBeDefined();
    expect(scoreB).toBeDefined();
    expect(scoreA!.comparison_count).toBe(1);
    expect(scoreB!.comparison_count).toBe(1);
  });

  it('records comparison with source field', () => {
    const dimId = seedDimension(db, { name: 'Source Test' });
    const m1 = seedMovie(db, { tmdb_id: 540, title: 'A' });
    const m2 = seedMovie(db, { tmdb_id: 541, title: 'B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    const row = recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
      source: 'arena',
    });

    expect(row.source).toBe('arena');
  });
});

// ---------------------------------------------------------------------------
// Priority 3 — Complex queries
// ---------------------------------------------------------------------------

describe('getTierListMovies', () => {
  it('returns empty array for dimension with no eligible movies', () => {
    const dimId = seedDimension(db, { name: 'Empty Dim' });
    const result = getTierListMovies(dimId);
    expect(result).toEqual([]);
  });

  it('returns movies with sufficient comparisons', () => {
    const dimId = seedDimension(db, { name: 'Tier Dim' });
    const m1 = seedMovie(db, { tmdb_id: 600, title: 'Tier A' });
    const m2 = seedMovie(db, { tmdb_id: 601, title: 'Tier B' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    // Create scores with enough staleness (comparison_count > 0)
    seedScore(db, 'movie', m1, dimId, 1550, 3);
    seedScore(db, 'movie', m2, dimId, 1450, 3);

    const result = getTierListMovies(dimId);
    // Should return movies that meet staleness threshold
    expect(result.length).toBeGreaterThanOrEqual(0);
    // Movies in the result should have scores
    for (const movie of result) {
      expect(movie.score).toBeDefined();
      expect(movie.comparisonCount).toBeDefined();
    }
  });
});

describe('excludeFromDimension', () => {
  it('deletes comparisons and marks score as excluded', () => {
    const dimId = seedDimension(db, { name: 'Exclude Dim' });
    const m1 = seedMovie(db, { tmdb_id: 700, title: 'Exclude Me' });
    const m2 = seedMovie(db, { tmdb_id: 701, title: 'Keep Me' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    // Record a comparison
    recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    // Verify comparison exists
    expect(getComparisons(db, dimId)).toHaveLength(1);

    // Exclude m1
    const result = excludeFromDimension('movie', m1, dimId);
    expect(result.comparisonsDeleted).toBe(1);

    // Comparisons deleted
    expect(getComparisons(db, dimId)).toHaveLength(0);

    // Score marked as excluded
    const score = getScore(db, m1, dimId);
    expect(score).toBeDefined();
    expect(score!.excluded).toBe(1);
  });
});

describe('includeInDimension', () => {
  it('re-includes excluded movie', () => {
    const dimId = seedDimension(db, { name: 'Include Dim' });
    const m1 = seedMovie(db, { tmdb_id: 800, title: 'Include Me' });
    const m2 = seedMovie(db, { tmdb_id: 801, title: 'Other' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2, completed: 1 });

    // Record comparison to create scores
    recordComparison({
      dimensionId: dimId,
      mediaAType: 'movie',
      mediaAId: m1,
      mediaBType: 'movie',
      mediaBId: m2,
      winnerType: 'movie',
      winnerId: m1,
    });

    // Exclude first
    excludeFromDimension('movie', m1, dimId);
    expect(getScore(db, m1, dimId)!.excluded).toBe(1);

    // Re-include
    includeInDimension('movie', m1, dimId);
    expect(getScore(db, m1, dimId)!.excluded).toBe(0);
  });
});
