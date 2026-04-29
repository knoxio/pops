import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from 'better-sqlite3';

// Prevent side-effect registration from throwing on import
vi.mock('../../core/search/registry.js', () => ({
  registerSearchAdapter: vi.fn(),
  getAdapters: vi.fn(),
  resetRegistry: vi.fn(),
}));

import { seedWishListItem, setupTestContext } from '../../../shared/test-utils.js';
import { registerSearchAdapter } from '../../core/search/registry.js';
import { type WishlistHitData, wishlistSearchAdapter } from './search-adapter.js';

import type { SearchHit } from '../../core/search/index.js';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

function search(query: string, limit?: number): SearchHit<WishlistHitData>[] {
  return wishlistSearchAdapter.search(
    { text: query },
    { app: 'finance', page: 'wishlist' },
    limit ? { limit } : undefined
  ) as SearchHit<WishlistHitData>[];
}

describe('wishlist search adapter', () => {
  it('registers with correct metadata', () => {
    expect(wishlistSearchAdapter.domain).toBe('wishlist');
    expect(wishlistSearchAdapter.icon).toBe('Star');
    expect(wishlistSearchAdapter.color).toBe('yellow');
    expect(registerSearchAdapter).toHaveBeenCalledWith(wishlistSearchAdapter);
  });

  it('returns empty results for empty query', () => {
    seedWishListItem(db, { item: 'Japan Trip' });
    expect(search('')).toEqual([]);
    expect(search('  ')).toEqual([]);
  });

  it('returns exact match with score 1.0', () => {
    seedWishListItem(db, { item: 'Japan Trip', priority: 'high', target_amount: 5000 });

    const hits = search('Japan Trip');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.matchType).toBe('exact');
    expect(hits[0]!.matchField).toBe('item');
    expect(hits[0]!.data).toEqual({
      item: 'Japan Trip',
      priority: 'high',
      targetAmount: 5000,
    });
  });

  it('exact match is case-insensitive for ASCII', () => {
    seedWishListItem(db, { item: 'Japan Trip' });

    const hits = search('japan trip');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.matchType).toBe('exact');
  });

  it('match is case-insensitive for non-ASCII characters', () => {
    seedWishListItem(db, { item: 'Café au Lait Machine' });

    const hits = search('café');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.matchType).toBe('prefix');
  });

  it('returns prefix match with score 0.8', () => {
    seedWishListItem(db, { item: 'Gaming PC', priority: 'medium', target_amount: 2000 });

    const hits = search('Gaming');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0.8);
    expect(hits[0]!.matchType).toBe('prefix');
    expect(hits[0]!.data.item).toBe('Gaming PC');
  });

  it('returns contains match with score 0.5', () => {
    seedWishListItem(db, { item: 'Standing Desk' });

    const hits = search('anding');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0.5);
    expect(hits[0]!.matchType).toBe('contains');
  });

  it('sorts results by score descending', () => {
    seedWishListItem(db, { item: 'Camera' });
    seedWishListItem(db, { item: 'Camera Bag' });
    seedWishListItem(db, { item: 'Action Camera Mount' });

    const hits = search('Camera');
    expect(hits.length).toBeGreaterThanOrEqual(2);

    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.data.item).toBe('Camera');
    expect(hits[1]!.score).toBe(0.8);
    expect(hits[1]!.data.item).toBe('Camera Bag');
    expect(hits[2]!.score).toBe(0.5);
    expect(hits[2]!.data.item).toBe('Action Camera Mount');
  });

  it('uri points to wishlist page', () => {
    seedWishListItem(db, { item: 'Japan Trip' });

    const hits = search('japan');
    expect(hits[0]!.uri).toBe('/finance/wishlist');
  });

  it('includes hit data with item, priority, and targetAmount', () => {
    seedWishListItem(db, { item: 'New Camera', priority: 'low', target_amount: 1200 });

    const hits = search('New Camera');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.data).toEqual({
      item: 'New Camera',
      priority: 'low',
      targetAmount: 1200,
    });
  });

  it('handles null priority and targetAmount', () => {
    seedWishListItem(db, { item: 'Standing Desk', priority: null, target_amount: null });

    const hits = search('Standing Desk');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.data.priority).toBeNull();
    expect(hits[0]!.data.targetAmount).toBeNull();
  });

  it('returns no results when nothing matches', () => {
    seedWishListItem(db, { item: 'Japan Trip' });
    expect(search('zzz-no-match')).toEqual([]);
  });

  it('respects limit option', () => {
    for (let i = 0; i < 5; i++) {
      seedWishListItem(db, { item: `Gadget ${i}` });
    }

    const hits = search('Gadget', 3);
    expect(hits).toHaveLength(3);
  });
});
