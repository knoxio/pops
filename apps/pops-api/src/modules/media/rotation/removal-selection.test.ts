import { describe, expect, it } from 'vitest';

import {
  calculateRemovalDeficit,
  type EligibleMovie,
  type MovieSizeMap,
  selectMoviesForRemoval,
} from './removal-selection.js';

// ---------------------------------------------------------------------------
// calculateRemovalDeficit
// ---------------------------------------------------------------------------

describe('calculateRemovalDeficit', () => {
  it('returns 0 when current free space exceeds target', () => {
    expect(calculateRemovalDeficit(100, 150, 0)).toBe(0);
  });

  it('returns 0 when free space plus leaving size covers target', () => {
    // target=100, current=80, leaving=30 → deficit = 100 - 80 - 30 = -10 → 0
    expect(calculateRemovalDeficit(100, 80, 30)).toBe(0);
  });

  it('returns positive deficit when space is insufficient', () => {
    // target=100, current=50, leaving=10 → deficit = 100 - 50 - 10 = 40
    expect(calculateRemovalDeficit(100, 50, 10)).toBe(40);
  });

  it('accounts for zero leaving size', () => {
    // target=100, current=60, leaving=0 → deficit = 40
    expect(calculateRemovalDeficit(100, 60, 0)).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// selectMoviesForRemoval
// ---------------------------------------------------------------------------

function makeMovie(id: number, tmdbId: number, title: string, daysOld: number): EligibleMovie {
  const d = new Date();
  d.setDate(d.getDate() - daysOld);
  return { id, tmdbId, title, createdAt: d.toISOString() };
}

describe('selectMoviesForRemoval', () => {
  const eligible: EligibleMovie[] = [
    makeMovie(1, 100, 'Old Movie', 90),
    makeMovie(2, 200, 'Medium Movie', 60),
    makeMovie(3, 300, 'Recent Movie', 30),
    makeMovie(4, 400, 'Very Recent', 7),
  ];

  const sizes: MovieSizeMap = new Map([
    [100, 10], // 10 GB
    [200, 20], // 20 GB
    [300, 15], // 15 GB
    [400, 5], // 5 GB
  ]);

  it('returns empty when deficit is 0', () => {
    const result = selectMoviesForRemoval(eligible, sizes, 0);
    expect(result.moviesToMark).toHaveLength(0);
    expect(result.totalSizeGb).toBe(0);
  });

  it('returns empty when deficit is negative', () => {
    const result = selectMoviesForRemoval(eligible, sizes, -10);
    expect(result.moviesToMark).toHaveLength(0);
  });

  it('selects oldest movie first when it covers the deficit', () => {
    const result = selectMoviesForRemoval(eligible, sizes, 8);
    expect(result.moviesToMark).toHaveLength(1);
    expect(result.moviesToMark[0]!.tmdbId).toBe(100);
    expect(result.totalSizeGb).toBe(10);
  });

  it('accumulates movies until deficit is covered', () => {
    // Need 25 GB: movie 1 (10) + movie 2 (20) = 30 >= 25
    const result = selectMoviesForRemoval(eligible, sizes, 25);
    expect(result.moviesToMark).toHaveLength(2);
    expect(result.moviesToMark.map((m) => m.tmdbId)).toEqual([100, 200]);
    expect(result.totalSizeGb).toBe(30);
  });

  it('selects all movies if deficit exceeds total available', () => {
    const result = selectMoviesForRemoval(eligible, sizes, 100);
    expect(result.moviesToMark).toHaveLength(4);
    expect(result.totalSizeGb).toBe(50);
  });

  it('skips movies with zero size', () => {
    const sizesWithZero: MovieSizeMap = new Map([
      [100, 0],
      [200, 20],
      [300, 15],
      [400, 5],
    ]);
    const result = selectMoviesForRemoval(eligible, sizesWithZero, 10);
    // Skips movie 100 (0 GB), takes movie 200 (20 GB)
    expect(result.moviesToMark).toHaveLength(1);
    expect(result.moviesToMark[0]!.tmdbId).toBe(200);
    expect(result.totalSizeGb).toBe(20);
  });

  it('handles empty eligible list', () => {
    const result = selectMoviesForRemoval([], sizes, 50);
    expect(result.moviesToMark).toHaveLength(0);
    expect(result.totalSizeGb).toBe(0);
  });
});
