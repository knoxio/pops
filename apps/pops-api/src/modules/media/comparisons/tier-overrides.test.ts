import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedDimension, seedMovie, setupTestContext } from '../../../shared/test-utils.js';
import {
  getTierListPlacementsForDimension,
  getTierOverrideForMedia,
  getTierOverrides,
  removeTierOverride,
  setTierOverride,
} from './tier-overrides.js';

import type { Database } from 'better-sqlite3';

function seedMediaScore(
  db: Database,
  mediaId: number,
  dimensionId: number,
  score: number,
  comparisonCount = 1
): void {
  db.prepare(
    `INSERT INTO media_scores
       (media_type, media_id, dimension_id, score, comparison_count, updated_at)
     VALUES ('movie', ?, ?, ?, ?, datetime('now'))`
  ).run(mediaId, dimensionId, score, comparisonCount);
}

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('setTierOverride', () => {
  it('creates a new tier override', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const result = setTierOverride('movie', 100, dimId, 'S');

    expect(result).toMatchObject({
      mediaType: 'movie',
      mediaId: 100,
      dimensionId: dimId,
      tier: 'S',
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.createdAt).toBeTruthy();
  });

  it('upserts — updates tier if override already exists', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const first = setTierOverride('movie', 100, dimId, 'A');
    const second = setTierOverride('movie', 100, dimId, 'S');

    expect(second.id).toBe(first.id);
    expect(second.tier).toBe('S');
  });

  it('allows different dimensions for the same media item', () => {
    const dim1 = seedDimension(db, { name: 'Overall' });
    const dim2 = seedDimension(db, { name: 'Acting' });

    setTierOverride('movie', 100, dim1, 'S');
    setTierOverride('movie', 100, dim2, 'B');

    expect(getTierOverrideForMedia('movie', 100, dim1)?.tier).toBe('S');
    expect(getTierOverrideForMedia('movie', 100, dim2)?.tier).toBe('B');
  });

  it('allows different media types with same id', () => {
    const dimId = seedDimension(db, { name: 'Overall' });

    setTierOverride('movie', 1, dimId, 'A');
    setTierOverride('tv_show', 1, dimId, 'S');

    expect(getTierOverrideForMedia('movie', 1, dimId)?.tier).toBe('A');
    expect(getTierOverrideForMedia('tv_show', 1, dimId)?.tier).toBe('S');
  });
});

describe('removeTierOverride', () => {
  it('removes an existing override and returns true', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    setTierOverride('movie', 100, dimId, 'S');

    const removed = removeTierOverride('movie', 100, dimId);
    expect(removed).toBe(true);
    expect(getTierOverrideForMedia('movie', 100, dimId)).toBeNull();
  });

  it('returns false when no override exists', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const removed = removeTierOverride('movie', 999, dimId);
    expect(removed).toBe(false);
  });
});

describe('getTierOverrides', () => {
  it('returns all overrides for a dimension ordered by tier', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    setTierOverride('movie', 1, dimId, 'C');
    setTierOverride('movie', 2, dimId, 'A');
    setTierOverride('movie', 3, dimId, 'S');

    const overrides = getTierOverrides(dimId);
    expect(overrides).toHaveLength(3);
    expect(overrides.map((o) => o.tier)).toEqual(['A', 'C', 'S']);
  });

  it('returns empty array when no overrides exist', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    expect(getTierOverrides(dimId)).toEqual([]);
  });

  it('does not return overrides from other dimensions', () => {
    const dim1 = seedDimension(db, { name: 'Overall' });
    const dim2 = seedDimension(db, { name: 'Acting' });

    setTierOverride('movie', 1, dim1, 'S');
    setTierOverride('movie', 2, dim2, 'A');

    const overrides = getTierOverrides(dim1);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]?.mediaId).toBe(1);
  });
});

describe('getTierOverrideForMedia', () => {
  it('returns the override for a specific media item', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    setTierOverride('movie', 100, dimId, 'S');

    const override = getTierOverrideForMedia('movie', 100, dimId);
    expect(override).not.toBeNull();
    expect(override?.tier).toBe('S');
  });

  it('returns null when no override exists', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    expect(getTierOverrideForMedia('movie', 999, dimId)).toBeNull();
  });
});

describe('getTierListPlacementsForDimension', () => {
  it('returns placements joined with movie metadata', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const movieA = seedMovie(db, { tmdb_id: 100, title: 'Alpha' });
    const movieB = seedMovie(db, { tmdb_id: 200, title: 'Bravo' });
    seedMediaScore(db, movieA, dimId, 1620, 4);
    seedMediaScore(db, movieB, dimId, 1480, 3);
    setTierOverride('movie', movieA, dimId, 'S');
    setTierOverride('movie', movieB, dimId, 'B');

    const placements = getTierListPlacementsForDimension(dimId);

    expect(placements).toHaveLength(2);
    const byTier = Object.fromEntries(placements.map((p) => [p.tier, p]));
    expect(byTier.S).toMatchObject({
      mediaId: movieA,
      mediaType: 'movie',
      title: 'Alpha',
      score: 1620,
      comparisonCount: 4,
      posterUrl: '/media/images/movie/100/poster.jpg',
    });
    expect(byTier.B).toMatchObject({
      mediaId: movieB,
      title: 'Bravo',
      score: 1480,
      comparisonCount: 3,
    });
  });

  it('falls back to default score when no media_scores row exists', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const movieA = seedMovie(db, { tmdb_id: 100, title: 'Alpha' });
    setTierOverride('movie', movieA, dimId, 'S');

    const placements = getTierListPlacementsForDimension(dimId);

    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({ score: 1500, comparisonCount: 0 });
  });

  it('prefers poster_override_path over the tmdb-derived URL', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    const movieA = seedMovie(db, {
      tmdb_id: 100,
      title: 'Alpha',
      poster_override_path: '/custom/poster.jpg',
    });
    setTierOverride('movie', movieA, dimId, 'A');

    const [placement] = getTierListPlacementsForDimension(dimId);
    expect(placement?.posterUrl).toBe('/custom/poster.jpg');
  });

  it('does not return placements from other dimensions', () => {
    const dim1 = seedDimension(db, { name: 'Overall' });
    const dim2 = seedDimension(db, { name: 'Acting' });
    const movieA = seedMovie(db, { tmdb_id: 100, title: 'Alpha' });
    setTierOverride('movie', movieA, dim1, 'S');

    expect(getTierListPlacementsForDimension(dim2)).toEqual([]);
  });

  it('returns an empty array when no placements exist', () => {
    const dimId = seedDimension(db, { name: 'Overall' });
    expect(getTierListPlacementsForDimension(dimId)).toEqual([]);
  });
});
