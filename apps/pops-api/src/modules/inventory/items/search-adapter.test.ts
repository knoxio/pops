import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedInventoryItem, setupTestContext } from '../../../shared/test-utils.js';
import { resetRegistry } from '../../core/search/index.js';
import { inventoryItemsSearchAdapter } from './search-adapter.js';

import type { Database } from 'better-sqlite3';

import type { SearchHit } from '../../core/search/index.js';
import type { InventoryItemHitData } from './search-adapter.js';

const ctx = setupTestContext();
let db: Database;

/** Helper — the adapter is synchronous so cast the return value. */
function search(text: string, options?: { limit?: number }): SearchHit<InventoryItemHitData>[] {
  return inventoryItemsSearchAdapter.search(
    { text },
    { app: 'inventory', page: 'items' },
    options
  ) as SearchHit<InventoryItemHitData>[];
}

beforeEach(() => {
  ({ db } = ctx.setup());
  resetRegistry();
});

afterEach(() => {
  ctx.teardown();
});

describe('inventoryItemsSearchAdapter', () => {
  it('has correct domain, icon, and color', () => {
    expect(inventoryItemsSearchAdapter.domain).toBe('inventory-items');
    expect(inventoryItemsSearchAdapter.icon).toBe('Box');
    expect(inventoryItemsSearchAdapter.color).toBe('amber');
  });

  it('returns empty array for empty query', () => {
    seedInventoryItem(db, { item_name: 'MacBook Pro' });
    expect(search('')).toEqual([]);
  });

  it('returns empty array for whitespace-only query', () => {
    seedInventoryItem(db, { item_name: 'MacBook Pro' });
    expect(search('   ')).toEqual([]);
  });

  describe('name search', () => {
    it('finds exact name match', () => {
      seedInventoryItem(db, { item_name: 'MacBook Pro' });
      const hits = search('MacBook Pro');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.matchField).toBe('itemName');
      expect(hits[0]!.matchType).toBe('exact');
      expect(hits[0]!.score).toBe(0.85);
      expect(hits[0]!.data.itemName).toBe('MacBook Pro');
    });

    it('finds prefix name match', () => {
      seedInventoryItem(db, { item_name: 'MacBook Pro 16-inch' });
      const hits = search('MacBook');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.matchField).toBe('itemName');
      expect(hits[0]!.matchType).toBe('prefix');
      expect(hits[0]!.score).toBe(0.7);
    });

    it('finds contains name match', () => {
      seedInventoryItem(db, { item_name: 'Apple MacBook Pro' });
      const hits = search('MacBook');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.matchField).toBe('itemName');
      expect(hits[0]!.matchType).toBe('contains');
      expect(hits[0]!.score).toBe(0.5);
    });

    it('is case-insensitive', () => {
      seedInventoryItem(db, { item_name: 'MacBook Pro' });
      const hits = search('macbook pro');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.matchType).toBe('exact');
    });

    it('returns hit data fields', () => {
      seedInventoryItem(db, {
        item_name: 'MacBook Pro',
        asset_id: 'INV-001',
        location: 'Office',
        type: 'Electronics',
        condition: 'good',
      });
      const hits = search('MacBook');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.data).toEqual({
        itemName: 'MacBook Pro',
        assetId: 'INV-001',
        location: 'Office',
        type: 'Electronics',
        condition: 'good',
      });
    });
  });

  describe('asset ID search', () => {
    it('finds exact asset ID match with score 1.0', () => {
      seedInventoryItem(db, { item_name: 'Laptop', asset_id: 'INV-001' });
      const hits = search('INV-001');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.matchField).toBe('assetId');
      expect(hits[0]!.matchType).toBe('exact');
      expect(hits[0]!.score).toBe(1.0);
    });

    it('finds prefix asset ID match with score 0.9', () => {
      seedInventoryItem(db, { item_name: 'Laptop', asset_id: 'INV-001' });
      const hits = search('INV-0');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.matchField).toBe('assetId');
      expect(hits[0]!.matchType).toBe('prefix');
      expect(hits[0]!.score).toBe(0.9);
    });

    it('asset ID exact match is case-insensitive', () => {
      seedInventoryItem(db, { item_name: 'Laptop', asset_id: 'INV-001' });
      const hits = search('inv-001');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.matchField).toBe('assetId');
      expect(hits[0]!.matchType).toBe('exact');
      expect(hits[0]!.score).toBe(1.0);
    });
  });

  describe('ranking', () => {
    it('asset ID matches outrank name matches', () => {
      const id1 = seedInventoryItem(db, { item_name: 'INV-100 Label Maker', asset_id: null });
      const id2 = seedInventoryItem(db, { item_name: 'Printer', asset_id: 'INV-100' });

      const hits = search('INV-100');
      expect(hits).toHaveLength(2);
      // Asset ID exact match (1.0) should come before name contains match (0.5)
      expect(hits[0]!.uri).toBe(`/inventory/items/${id2}`);
      expect(hits[0]!.matchField).toBe('assetId');
      expect(hits[0]!.score).toBe(1.0);
      expect(hits[1]!.uri).toBe(`/inventory/items/${id1}`);
      expect(hits[1]!.matchField).toBe('itemName');
    });

    it('does not duplicate items matched by both asset ID and name', () => {
      seedInventoryItem(db, { item_name: 'INV-050 Widget', asset_id: 'INV-050' });
      const hits = search('INV-050');
      // Should appear once (asset ID exact match), not twice
      expect(hits).toHaveLength(1);
      expect(hits[0]!.matchField).toBe('assetId');
      expect(hits[0]!.score).toBe(1.0);
    });

    it('sorts by score descending', () => {
      seedInventoryItem(db, { item_name: 'Pro Camera', asset_id: null });
      seedInventoryItem(db, { item_name: 'Camera Pro Max', asset_id: null });
      seedInventoryItem(db, { item_name: 'Camera', asset_id: null });

      const hits = search('Camera');
      expect(hits).toHaveLength(3);
      // exact (0.85) > prefix (0.7) > contains (0.5)
      expect(hits[0]!.data.itemName).toBe('Camera');
      expect(hits[1]!.data.itemName).toBe('Camera Pro Max');
      expect(hits[2]!.data.itemName).toBe('Pro Camera');
    });
  });

  describe('uri format', () => {
    it('returns correct URI', () => {
      const id = seedInventoryItem(db, { item_name: 'Test Item' });
      const hits = search('Test Item');
      expect(hits[0]!.uri).toBe(`/inventory/items/${id}`);
    });
  });

  describe('limit', () => {
    it('respects the limit option', () => {
      for (let i = 0; i < 5; i++) {
        seedInventoryItem(db, { item_name: `Item ${i}` });
      }
      const hits = search('Item', { limit: 2 });
      expect(hits).toHaveLength(2);
    });
  });
});
