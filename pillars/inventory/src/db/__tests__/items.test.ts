/**
 * Invariant tests for the items service against an in-memory SQLite
 * seeded with the canonical `home_inventory` table. Pure DB + service
 * layer.
 *
 * The `home_inventory` schema is inlined here because its canonical
 * migration bundles unrelated FK tables; the locations migration is read
 * from the package's migrations dir so the FK target exists for the
 * location-filter tests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { itemsService } from '../index.js';
import { ItemNotFoundError } from '../services/items-errors.js';
import { createLocation } from '../services/locations.js';

import type { InventoryDb } from '../services/internal.js';

const LOCATIONS_MIGRATION = join(__dirname, '../../../migrations/0005_fancy_crystal.sql');

const HOME_INVENTORY_DDL = `
CREATE TABLE home_inventory (
  id text PRIMARY KEY NOT NULL,
  notion_id text UNIQUE,
  item_name text NOT NULL,
  brand text,
  model text,
  item_id text,
  room text,
  location text,
  type text,
  condition text DEFAULT 'good',
  in_use integer,
  deductible integer,
  purchase_date text,
  warranty_expires text,
  replacement_value real,
  resale_value real,
  purchase_transaction_id text,
  purchase_transaction_uri text,
  purchase_transaction_stale_at text,
  purchased_from_id text,
  purchased_from_name text,
  purchase_price real,
  owner_uri text,
  owner_stale_at text,
  asset_id text UNIQUE,
  notes text,
  location_id text REFERENCES locations(id) ON DELETE set null,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  last_edited_time text NOT NULL
);
CREATE INDEX idx_inventory_location ON home_inventory (location_id);
CREATE INDEX idx_inventory_name ON home_inventory (item_name);
CREATE INDEX idx_inventory_purchase_transaction_uri ON home_inventory (purchase_transaction_uri);
CREATE INDEX idx_inventory_owner_uri ON home_inventory (owner_uri);
`;

function freshDb(): InventoryDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(LOCATIONS_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  raw.exec(HOME_INVENTORY_DDL);
  return drizzle(raw);
}

const BASE_FILTERS = { limit: 50, offset: 0 } as const;

describe('itemsService.list', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns an empty result when no items exist', () => {
    const result = itemsService.list(db, { ...BASE_FILTERS });
    expect(result).toEqual({
      rows: [],
      total: 0,
      totalReplacementValue: 0,
      totalResaleValue: 0,
    });
  });

  it('orders results by item name ascending', () => {
    itemsService.create(db, { itemName: 'Couch' });
    itemsService.create(db, { itemName: 'Armchair' });
    itemsService.create(db, { itemName: 'Bed' });

    const result = itemsService.list(db, { ...BASE_FILTERS });
    expect(result.rows.map((r) => r.itemName)).toEqual(['Armchair', 'Bed', 'Couch']);
    expect(result.total).toBe(3);
  });

  it('paginates rows with limit + offset but reports the full total', () => {
    for (let i = 0; i < 5; i++) itemsService.create(db, { itemName: `Item ${i}` });

    const page1 = itemsService.list(db, { limit: 2, offset: 0 });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = itemsService.list(db, { limit: 2, offset: 2 });
    expect(page2.rows).toHaveLength(2);
    expect(page2.rows[0]!.itemName).not.toBe(page1.rows[0]!.itemName);
  });

  it('filters by partial item name (case-sensitive LIKE)', () => {
    itemsService.create(db, { itemName: 'Coffee Table' });
    itemsService.create(db, { itemName: 'Coffee Maker' });
    itemsService.create(db, { itemName: 'Chair' });

    const result = itemsService.list(db, { ...BASE_FILTERS, search: 'Coffee' });
    expect(result.total).toBe(2);
  });

  it('filters by room', () => {
    itemsService.create(db, { itemName: 'Fridge', room: 'Kitchen' });
    itemsService.create(db, { itemName: 'TV', room: 'Living' });

    const result = itemsService.list(db, { ...BASE_FILTERS, room: 'Kitchen' });
    expect(result.total).toBe(1);
    expect(result.rows[0]!.itemName).toBe('Fridge');
  });

  it('filters by type', () => {
    itemsService.create(db, { itemName: 'Fridge', type: 'appliance' });
    itemsService.create(db, { itemName: 'Couch', type: 'furniture' });

    const result = itemsService.list(db, { ...BASE_FILTERS, type: 'appliance' });
    expect(result.total).toBe(1);
  });

  it('filters by condition case-insensitively', () => {
    itemsService.create(db, { itemName: 'A', condition: 'Good' });
    itemsService.create(db, { itemName: 'B', condition: 'good' });
    itemsService.create(db, { itemName: 'C', condition: 'Broken' });

    const result = itemsService.list(db, { ...BASE_FILTERS, condition: 'GOOD' });
    expect(result.total).toBe(2);
  });

  it('filters by inUse and deductible flags', () => {
    itemsService.create(db, { itemName: 'A', inUse: true, deductible: true });
    itemsService.create(db, { itemName: 'B', inUse: false, deductible: true });
    itemsService.create(db, { itemName: 'C', inUse: true, deductible: false });

    expect(itemsService.list(db, { ...BASE_FILTERS, inUse: true }).total).toBe(2);
    expect(itemsService.list(db, { ...BASE_FILTERS, deductible: false }).total).toBe(1);
    expect(itemsService.list(db, { ...BASE_FILTERS, inUse: true, deductible: true }).total).toBe(1);
  });

  it('filters by assetId exactly', () => {
    itemsService.create(db, { itemName: 'A', assetId: 'AST-1' });
    itemsService.create(db, { itemName: 'B', assetId: 'AST-2' });

    const result = itemsService.list(db, { ...BASE_FILTERS, assetId: 'AST-1' });
    expect(result.total).toBe(1);
  });

  it('filters by locationId (direct only)', () => {
    const kitchen = createLocation(db, { name: 'Kitchen' });
    const bedroom = createLocation(db, { name: 'Bedroom' });
    itemsService.create(db, { itemName: 'Fridge', locationId: kitchen.id });
    itemsService.create(db, { itemName: 'Bed', locationId: bedroom.id });

    const result = itemsService.list(db, { ...BASE_FILTERS, locationId: kitchen.id });
    expect(result.total).toBe(1);
    expect(result.rows[0]!.itemName).toBe('Fridge');
  });

  it('filters by locationId including descendants', () => {
    const home = createLocation(db, { name: 'Home' });
    const kitchen = createLocation(db, { name: 'Kitchen', parentId: home.id });
    itemsService.create(db, { itemName: 'Couch', locationId: home.id });
    itemsService.create(db, { itemName: 'Fridge', locationId: kitchen.id });
    itemsService.create(db, { itemName: 'Orphan', locationId: null });

    const result = itemsService.list(db, {
      ...BASE_FILTERS,
      locationId: home.id,
      includeChildren: true,
    });
    expect(result.total).toBe(2);
  });

  it('aggregates replacement and resale values across filtered rows', () => {
    itemsService.create(db, { itemName: 'A', replacementValue: 100, resaleValue: 40 });
    itemsService.create(db, { itemName: 'B', replacementValue: 200, resaleValue: 80 });
    itemsService.create(db, { itemName: 'C' });

    const result = itemsService.list(db, { ...BASE_FILTERS });
    expect(result.totalReplacementValue).toBe(300);
    expect(result.totalResaleValue).toBe(120);
  });
});

describe('itemsService.get', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the row when present', () => {
    const created = itemsService.create(db, { itemName: 'Lamp' });
    const row = itemsService.get(db, created.id);
    expect(row.id).toBe(created.id);
    expect(row.itemName).toBe('Lamp');
  });

  it('throws ItemNotFoundError when missing', () => {
    expect(() => itemsService.get(db, 'nope')).toThrowError(ItemNotFoundError);
  });
});

describe('itemsService.searchByAssetId', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the row for an exact match', () => {
    itemsService.create(db, { itemName: 'A', assetId: 'AST-1' });
    const row = itemsService.searchByAssetId(db, 'AST-1');
    expect(row).not.toBeNull();
    expect(row!.itemName).toBe('A');
  });

  it('matches case-insensitively', () => {
    itemsService.create(db, { itemName: 'A', assetId: 'AST-001' });
    expect(itemsService.searchByAssetId(db, 'ast-001')).not.toBeNull();
  });

  it('returns null when no asset matches', () => {
    expect(itemsService.searchByAssetId(db, 'missing')).toBeNull();
  });
});

describe('itemsService.getByAssetId', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('throws ItemNotFoundError when no asset matches', () => {
    expect(() => itemsService.getByAssetId(db, 'nope')).toThrowError(ItemNotFoundError);
  });

  it('returns the row when present (case-insensitive)', () => {
    itemsService.create(db, { itemName: 'A', assetId: 'AST-1' });
    expect(itemsService.getByAssetId(db, 'ast-1').itemName).toBe('A');
  });
});

describe('itemsService.countByAssetPrefix', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('counts rows whose assetId starts with the prefix, case-insensitively', () => {
    itemsService.create(db, { itemName: 'A', assetId: 'POPS-001' });
    itemsService.create(db, { itemName: 'B', assetId: 'POPS-002' });
    itemsService.create(db, { itemName: 'C', assetId: 'OTHER-1' });

    expect(itemsService.countByAssetPrefix(db, 'POPS-')).toBe(2);
    expect(itemsService.countByAssetPrefix(db, 'pops-')).toBe(2);
    expect(itemsService.countByAssetPrefix(db, 'MISSING')).toBe(0);
  });
});

describe('itemsService.distinctTypes', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns distinct non-null types sorted ascending', () => {
    itemsService.create(db, { itemName: 'A', type: 'appliance' });
    itemsService.create(db, { itemName: 'B', type: 'furniture' });
    itemsService.create(db, { itemName: 'C', type: 'appliance' });
    itemsService.create(db, { itemName: 'D', type: null });

    expect(itemsService.distinctTypes(db)).toEqual(['appliance', 'furniture']);
  });

  it('returns empty array when nothing is typed', () => {
    expect(itemsService.distinctTypes(db)).toEqual([]);
  });
});

describe('itemsService.create', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('creates a minimal item with defaults and a stable id', () => {
    const row = itemsService.create(db, { itemName: 'Lamp' });
    expect(row.id).toMatch(/[0-9a-f-]{36}/i);
    expect(row.itemName).toBe('Lamp');
    expect(row.inUse).toBe(0);
    expect(row.deductible).toBe(0);
    expect(row.assetId).toBeNull();
    expect(row.lastEditedTime).toBeTruthy();
  });

  it('persists nullable string fields', () => {
    const row = itemsService.create(db, {
      itemName: 'Fridge',
      brand: 'Brand',
      assetId: 'AST-1',
      notes: 'cold',
    });
    expect(row.brand).toBe('Brand');
    expect(row.assetId).toBe('AST-1');
    expect(row.notes).toBe('cold');
  });

  it('persists numeric fields and boolean flags', () => {
    const row = itemsService.create(db, {
      itemName: 'Couch',
      inUse: true,
      deductible: true,
      replacementValue: 500,
      resaleValue: 100,
      purchasePrice: 750,
    });
    expect(row.inUse).toBe(1);
    expect(row.deductible).toBe(1);
    expect(row.replacementValue).toBe(500);
    expect(row.resaleValue).toBe(100);
    expect(row.purchasePrice).toBe(750);
  });
});

describe('itemsService.update', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('renames an item', () => {
    const created = itemsService.create(db, { itemName: 'Befor' });
    const updated = itemsService.update(db, created.id, { itemName: 'After' });
    expect(updated.itemName).toBe('After');
  });

  it('clears a field when passed null', () => {
    const created = itemsService.create(db, { itemName: 'A', brand: 'X' });
    const updated = itemsService.update(db, created.id, { brand: null });
    expect(updated.brand).toBeNull();
  });

  it('leaves unspecified fields unchanged', () => {
    const created = itemsService.create(db, { itemName: 'A', brand: 'X', notes: 'keep' });
    const updated = itemsService.update(db, created.id, { brand: 'Y' });
    expect(updated.brand).toBe('Y');
    expect(updated.notes).toBe('keep');
  });

  it('updates boolean flags', () => {
    const created = itemsService.create(db, { itemName: 'A', inUse: false });
    const updated = itemsService.update(db, created.id, { inUse: true });
    expect(updated.inUse).toBe(1);
  });

  it('throws ItemNotFoundError for a missing id', () => {
    expect(() => itemsService.update(db, 'nope', { itemName: 'X' })).toThrowError(
      ItemNotFoundError
    );
  });

  it('is a no-op when no fields are provided', () => {
    const created = itemsService.create(db, { itemName: 'A' });
    const originalLastEdited = created.lastEditedTime;
    const updated = itemsService.update(db, created.id, {});
    expect(updated.lastEditedTime).toBe(originalLastEdited);
  });
});

describe('itemsService.delete', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('deletes an existing row', () => {
    const created = itemsService.create(db, { itemName: 'Tmp' });
    itemsService.delete(db, created.id);
    expect(() => itemsService.get(db, created.id)).toThrowError(ItemNotFoundError);
  });

  it('throws ItemNotFoundError when missing', () => {
    expect(() => itemsService.delete(db, 'nope')).toThrowError(ItemNotFoundError);
  });
});
