import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  seedWatchlistEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';
import { getSmartPair } from './service.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

/** Seed a media score row directly for testing. */
function seedScore(
  dimensionId: number,
  mediaId: number,
  score: number,
  comparisonCount: number
): void {
  db.prepare(
    `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count)
     VALUES ('movie', ?, ?, ?, ?)`
  ).run(mediaId, dimensionId, score, comparisonCount);
}

/** Seed a staleness row directly for testing. */
function seedStaleness(mediaId: number, staleness: number): void {
  db.prepare(
    `INSERT INTO comparison_staleness (media_type, media_id, staleness)
     VALUES ('movie', ?, ?)`
  ).run(mediaId, staleness);
}

/** Seed a cooloff row. */
function seedCooloff(
  dimensionId: number,
  mediaAId: number,
  mediaBId: number,
  skipUntil: number
): void {
  db.prepare(
    `INSERT INTO comparison_skip_cooloffs (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, skip_until)
     VALUES (?, 'movie', ?, 'movie', ?, ?)`
  ).run(dimensionId, mediaAId, mediaBId, skipUntil);
}

describe('getSmartPair', () => {
  it('returns a pair of watched movies', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club', poster_path: '/fc.jpg' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix', poster_path: '/mx.jpg' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });

    const result = getSmartPair(dimId);
    expect(result).not.toBeNull();
    expect(result!.movieA).toHaveProperty('id');
    expect(result!.movieA).toHaveProperty('title');
    expect(result!.movieB).toHaveProperty('id');
    expect(result!.movieA.id).not.toBe(result!.movieB.id);
  });

  it('returns null when fewer than 2 watched movies', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });

    const result = getSmartPair(dimId);
    expect(result).toBeNull();
  });

  it('returns null when no watched movies exist', () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    const result = getSmartPair(dimId);
    expect(result).toBeNull();
  });

  it('excludes blacklisted movies', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Inception' });
    // m1 has a blacklisted watch entry (only blacklisted entries)
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1, blacklisted: 1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m3 });

    // Run multiple times — m1 should never appear since all its watches are blacklisted
    for (let i = 0; i < 20; i++) {
      const result = getSmartPair(dimId);
      expect(result).not.toBeNull();
      const ids = [result!.movieA.id, result!.movieB.id];
      expect(ids).not.toContain(m1);
    }
  });

  it('excludes movies excluded for the dimension', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Inception' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m3 });

    // Mark m1 as excluded for this dimension
    seedScore(dimId, m1, 1500, 0);
    db.prepare(`UPDATE media_scores SET excluded = 1 WHERE media_id = ? AND dimension_id = ?`).run(
      m1,
      dimId
    );

    for (let i = 0; i < 20; i++) {
      const result = getSmartPair(dimId);
      expect(result).not.toBeNull();
      const ids = [result!.movieA.id, result!.movieB.id];
      expect(ids).not.toContain(m1);
    }
  });

  it('skips pairs on cooloff', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Inception' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m3 });

    // Put m1-m2 on cooloff (far future)
    seedCooloff(dimId, m1, m2, 999999);

    // Run many times — the pair (m1, m2) should never be selected
    for (let i = 0; i < 30; i++) {
      const result = getSmartPair(dimId);
      expect(result).not.toBeNull();
      const ids = [result!.movieA.id, result!.movieB.id].toSorted();
      expect(ids).not.toEqual([m1, m2].toSorted());
    }
  });

  it('favours close-score pairs over blowouts', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    // Create 3 movies: m1 and m2 close in score, m3 far away
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Inception' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m3 });

    seedScore(dimId, m1, 1500, 5);
    seedScore(dimId, m2, 1510, 5); // close to m1
    seedScore(dimId, m3, 1900, 5); // far from both

    // Count how often each pair is selected
    const pairCounts = new Map<string, number>();
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const result = getSmartPair(dimId);
      expect(result).not.toBeNull();
      const key = [result!.movieA.id, result!.movieB.id].toSorted().join('-');
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }

    // The close pair (m1-m2) should be selected more often than distant pairs
    const closePair = [m1, m2].toSorted().join('-');
    const closeCount = pairCounts.get(closePair) ?? 0;
    expect(closeCount).toBeGreaterThan(runs * 0.3); // Should be dominant
  });

  it('favours recently watched movies', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Inception' });

    // m1 watched yesterday, m2 watched yesterday, m3 watched 2 years ago
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m1,
      watched_at: yesterday,
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m2,
      watched_at: yesterday,
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: m3,
      watched_at: twoYearsAgo,
    });

    // Count appearances
    const appearances = new Map<number, number>();
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const result = getSmartPair(dimId);
      expect(result).not.toBeNull();
      appearances.set(result!.movieA.id, (appearances.get(result!.movieA.id) ?? 0) + 1);
      appearances.set(result!.movieB.id, (appearances.get(result!.movieB.id) ?? 0) + 1);
    }

    // m1 and m2 (recent) should appear more than m3 (old)
    const recentAppearances = (appearances.get(m1) ?? 0) + (appearances.get(m2) ?? 0);
    const oldAppearances = appearances.get(m3) ?? 0;
    expect(recentAppearances).toBeGreaterThan(oldAppearances);
  });

  it('deprioritises stale movies', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Inception' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m3 });

    // m3 is very stale
    seedStaleness(m3, 0.01);

    // Count appearances
    const appearances = new Map<number, number>();
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const result = getSmartPair(dimId);
      expect(result).not.toBeNull();
      appearances.set(result!.movieA.id, (appearances.get(result!.movieA.id) ?? 0) + 1);
      appearances.set(result!.movieB.id, (appearances.get(result!.movieB.id) ?? 0) + 1);
    }

    // m1 and m2 (fresh, staleness=1.0) should appear more than m3 (stale=0.01)
    const freshAppearances = (appearances.get(m1) ?? 0) + (appearances.get(m2) ?? 0);
    const staleAppearances = appearances.get(m3) ?? 0;
    expect(freshAppearances).toBeGreaterThan(staleAppearances * 2);
  });

  it('boosts under-sampled dimensions when no dimensionId given', () => {
    const dim1 = seedDimension(db, { name: 'Story' });
    seedDimension(db, { name: 'Visuals' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });

    // dim1 has many comparisons, dim2 has none
    seedScore(dim1, m1, 1600, 50);
    seedScore(dim1, m2, 1400, 50);
    // dim2 has no scores at all

    // getSmartPair without dimensionId should pick dim2 more often
    // since it's under-sampled (dimensionNeed = max/1 vs max/101)
    // But we can't directly observe which dimension was picked from the result.
    // We just verify it returns a valid pair.
    const result = getSmartPair();
    expect(result).not.toBeNull();
    expect(result!.movieA.id).not.toBe(result!.movieB.id);
  });

  it('produces variety via jitter (non-deterministic)', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const movies: number[] = [];
    for (let i = 0; i < 10; i++) {
      const mid = seedMovie(db, { tmdb_id: 550 + i, title: `Movie ${i}` });
      seedWatchHistoryEntry(db, { media_type: 'movie', media_id: mid });
      movies.push(mid);
    }

    // Run many times and check we get different pairs
    const uniquePairs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const result = getSmartPair(dimId);
      expect(result).not.toBeNull();
      const key = [result!.movieA.id, result!.movieB.id].toSorted().join('-');
      uniquePairs.add(key);
    }

    // With 10 movies (45 possible pairs) and jitter, we should see variety
    expect(uniquePairs.size).toBeGreaterThan(5);
  });

  it('excludes watchlisted movies when enough non-watchlisted movies remain', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    const m3 = seedMovie(db, { tmdb_id: 552, title: 'Inception' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m3 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: m3 });

    // m3 is watchlisted — should never appear since m1+m2 form a valid pair
    for (let i = 0; i < 20; i++) {
      const result = getSmartPair(dimId);
      expect(result).not.toBeNull();
      const ids = [result!.movieA.id, result!.movieB.id];
      expect(ids).not.toContain(m3);
    }
  });

  it('falls back to include watchlisted movies when fewer than 2 non-watchlisted remain', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });
    // Both movies are on the watchlist — without fallback, would return null
    seedWatchlistEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: m2 });

    // Should still return a pair using the watchlisted movies
    const result = getSmartPair(dimId);
    expect(result).not.toBeNull();
    const ids = new Set([result!.movieA.id, result!.movieB.id]);
    expect(ids.size).toBe(2);
  });

  it('falls back to any eligible pair when all scored pairs are on cooloff', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const m1 = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const m2 = seedMovie(db, { tmdb_id: 551, title: 'The Matrix' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: m2 });

    // Put the only possible pair on cooloff
    seedCooloff(dimId, m1, m2, 999999);

    // Should still return a pair (fallback)
    const result = getSmartPair(dimId);
    expect(result).not.toBeNull();
    const ids = new Set([result!.movieA.id, result!.movieB.id]);
    expect(ids.size).toBe(2);
  });
});
