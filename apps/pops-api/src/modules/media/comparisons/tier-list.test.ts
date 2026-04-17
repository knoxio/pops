import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedDimension, seedMovie, setupTestContext } from '../../../shared/test-utils.js';
import { deriveTierList } from './tier-list.js';

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
  db: Database,
  mediaType: string,
  mediaId: number,
  dimensionId: number,
  score: number,
  comparisonCount = 5,
  excluded = 0
) {
  db.prepare(
    `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, excluded)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(mediaType, mediaId, dimensionId, score, comparisonCount, excluded);
}

describe('deriveTierList', () => {
  it('returns empty array for dimension with no scores', () => {
    const dimId = seedDimension(db, { name: 'Empty' });
    const result = deriveTierList(dimId);
    expect(result).toEqual([]);
  });

  it('assigns single movie to S tier', () => {
    const dimId = seedDimension(db, { name: 'Solo' });
    const movieId = seedMovie(db, { tmdb_id: 100, title: 'Only Movie' });
    seedScore(db, 'movie', movieId, dimId, 1600);

    const result = deriveTierList(dimId);
    expect(result).toHaveLength(1);
    expect(result[0]!.tier).toBe('S');
    expect(result[0]!.movies).toHaveLength(1);
    expect(result[0]!.movies[0]!.title).toBe('Only Movie');
  });

  it('assigns tiers by percentile for 10 movies', () => {
    const dimId = seedDimension(db, { name: 'Full' });

    // Seed 10 movies with descending scores
    for (let i = 0; i < 10; i++) {
      const movieId = seedMovie(db, { tmdb_id: 200 + i, title: `Movie ${i}` });
      seedScore(db, 'movie', movieId, dimId, 2000 - i * 100);
    }

    const result = deriveTierList(dimId);

    // Top 10% (1 movie) = S
    const sMovies = result.find((g) => g.tier === 'S')?.movies ?? [];
    expect(sMovies).toHaveLength(1);
    expect(sMovies[0]!.score).toBe(2000);

    // Next 15% (1-2 movies) = A: positions 2 (20%)
    // Cumulative: 10%=S, 25%=A → movie at index 1 (20%) is A
    const aMovies = result.find((g) => g.tier === 'A')?.movies ?? [];
    expect(aMovies.length).toBeGreaterThanOrEqual(1);

    // All tiers accounted for
    const totalMovies = result.reduce((sum, g) => sum + g.movies.length, 0);
    expect(totalMovies).toBe(10);
  });

  it('excludes movies with comparison_count = 0', () => {
    const dimId = seedDimension(db, { name: 'Mixed' });
    const m1 = seedMovie(db, { tmdb_id: 300, title: 'Compared' });
    const m2 = seedMovie(db, { tmdb_id: 301, title: 'Uncompared' });
    seedScore(db, 'movie', m1, dimId, 1600, 5);
    seedScore(db, 'movie', m2, dimId, 1500, 0);

    const result = deriveTierList(dimId);
    const allMovies = result.flatMap((g) => g.movies);
    expect(allMovies).toHaveLength(1);
    expect(allMovies[0]!.title).toBe('Compared');
  });

  it('excludes movies with excluded = 1', () => {
    const dimId = seedDimension(db, { name: 'Exclusions' });
    const m1 = seedMovie(db, { tmdb_id: 400, title: 'Included' });
    const m2 = seedMovie(db, { tmdb_id: 401, title: 'Excluded' });
    seedScore(db, 'movie', m1, dimId, 1600, 5, 0);
    seedScore(db, 'movie', m2, dimId, 1800, 5, 1);

    const result = deriveTierList(dimId);
    const allMovies = result.flatMap((g) => g.movies);
    expect(allMovies).toHaveLength(1);
    expect(allMovies[0]!.title).toBe('Included');
  });

  it('returns movies sorted by score descending within tiers', () => {
    const dimId = seedDimension(db, { name: 'Sorted' });
    const m1 = seedMovie(db, { tmdb_id: 500, title: 'Top' });
    const m2 = seedMovie(db, { tmdb_id: 501, title: 'Middle' });
    const m3 = seedMovie(db, { tmdb_id: 502, title: 'Bottom' });
    seedScore(db, 'movie', m1, dimId, 1800, 5);
    seedScore(db, 'movie', m2, dimId, 1500, 5);
    seedScore(db, 'movie', m3, dimId, 1200, 5);

    const result = deriveTierList(dimId);
    const allMovies = result.flatMap((g) => g.movies);
    expect(allMovies[0]!.title).toBe('Top');
    expect(allMovies.at(-1)!.title).toBe('Bottom');
  });

  it('only includes empty tiers that have movies', () => {
    const dimId = seedDimension(db, { name: 'Sparse' });
    const m1 = seedMovie(db, { tmdb_id: 600, title: 'One' });
    const m2 = seedMovie(db, { tmdb_id: 601, title: 'Two' });
    seedScore(db, 'movie', m1, dimId, 1800, 5);
    seedScore(db, 'movie', m2, dimId, 1500, 5);

    const result = deriveTierList(dimId);
    // With 2 movies, not all 6 tiers should be present
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result.every((g) => g.movies.length > 0)).toBe(true);
  });

  it('includes score and comparisonCount in movie data', () => {
    const dimId = seedDimension(db, { name: 'Data' });
    const movieId = seedMovie(db, {
      tmdb_id: 700,
      title: 'Data Movie',
      release_date: '2024-06-15',
    });
    seedScore(db, 'movie', movieId, dimId, 1750.5, 12);

    const result = deriveTierList(dimId);
    const movie = result[0]!.movies[0]!;
    expect(movie.score).toBe(1750.5);
    expect(movie.comparisonCount).toBe(12);
    expect(movie.year).toBe(2024);
    expect(movie.mediaType).toBe('movie');
    expect(movie.mediaId).toBe(movieId);
  });
});
