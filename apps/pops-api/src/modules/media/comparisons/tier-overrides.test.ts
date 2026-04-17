import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedDimension, setupTestContext } from '../../../shared/test-utils.js';
import {
  getTierOverrideForMedia,
  getTierOverrides,
  removeTierOverride,
  setTierOverride,
} from './tier-overrides.js';

import type { Database } from 'better-sqlite3';

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
