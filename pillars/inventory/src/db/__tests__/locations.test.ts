/**
 * Invariant tests for the locations service against an in-memory SQLite
 * seeded with the canonical `locations` migration. Pure DB + service
 * layer — no tRPC, no Express, no auth middleware.
 *
 * Higher-level tRPC coverage lives in pops-api's own integration suite
 * (until the cutover PR routes it through this package).
 *
 * The locations CREATE TABLE is read from the package's own journal at
 * `pillars/inventory/migrations/0005_fancy_crystal.sql`, which is
 * now the sole source of truth for this tag (the shared-journal copy
 * was retired in roadmap row L4 — see `.claude/pillar-migration-roadmap.md`).
 * `home_inventory` is inlined with the columns this slice exercises
 * because its canonical migration (`0000_naive_chameleon`) bundles
 * unrelated FK tables — the items slice will read its own SQL file when
 * it lands.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  LocationCycleError,
  LocationNotFoundError,
  LocationSelfParentError,
  ParentLocationNotFoundError,
} from '../errors.js';
import { homeInventory } from '../schema.js';
import {
  getDeleteStats,
  getDescendantLocationIds,
  getLocationItems,
  getLocationPath,
} from '../services/locations-queries.js';
import {
  createLocation,
  deleteLocation,
  getChildren,
  getLocation,
  getLocationTree,
  listLocations,
  updateLocation,
} from '../services/locations.js';

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

function seedItem(
  db: InventoryDb,
  name: string,
  locationId: string | null
): { id: string; locationId: string | null } {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.insert(homeInventory).values({ id, itemName: name, locationId, lastEditedTime: now }).run();
  return { id, locationId };
}

describe('listLocations', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty result when no rows', () => {
    expect(listLocations(db)).toEqual({ rows: [], total: 0 });
  });

  it('orders by sortOrder then name', () => {
    createLocation(db, { name: 'Bedroom', sortOrder: 1 });
    createLocation(db, { name: 'Kitchen', sortOrder: 0 });
    createLocation(db, { name: 'Living Room', sortOrder: 0 });

    const result = listLocations(db);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.name)).toEqual(['Kitchen', 'Living Room', 'Bedroom']);
  });
});

describe('getLocation', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the row when present', () => {
    const created = createLocation(db, { name: 'Home' });
    const row = getLocation(db, created.id);
    expect(row.id).toBe(created.id);
    expect(row.name).toBe('Home');
    expect(row.parentId).toBeNull();
  });

  it('throws LocationNotFoundError when missing', () => {
    expect(() => getLocation(db, 'nope')).toThrowError(LocationNotFoundError);
  });
});

describe('getLocationTree', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty tree when no rows', () => {
    expect(getLocationTree(db)).toEqual([]);
  });

  it('returns flat root list when no parent links', () => {
    createLocation(db, { name: 'Home' });
    createLocation(db, { name: 'Car' });
    const tree = getLocationTree(db);
    expect(tree).toHaveLength(2);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it('nests children under parents', () => {
    const home = createLocation(db, { name: 'Home' });
    const kitchen = createLocation(db, { name: 'Kitchen', parentId: home.id });
    createLocation(db, { name: 'Pantry', parentId: kitchen.id });
    createLocation(db, { name: 'Bedroom', parentId: home.id });

    const tree = getLocationTree(db);
    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.name).toBe('Home');
    expect(root.children).toHaveLength(2);
    const kitchenNode = root.children.find((c) => c.name === 'Kitchen')!;
    expect(kitchenNode.children).toHaveLength(1);
    expect(kitchenNode.children[0]!.name).toBe('Pantry');
  });
});

describe('getChildren', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns only direct children', () => {
    const home = createLocation(db, { name: 'Home' });
    createLocation(db, { name: 'Kitchen', parentId: home.id });
    createLocation(db, { name: 'Bedroom', parentId: home.id });
    createLocation(db, { name: 'Car' });

    expect(getChildren(db, home.id)).toHaveLength(2);
  });
});

describe('getLocationPath', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns root-first breadcrumb', () => {
    const home = createLocation(db, { name: 'Home' });
    const kitchen = createLocation(db, { name: 'Kitchen', parentId: home.id });
    const pantry = createLocation(db, { name: 'Pantry', parentId: kitchen.id });

    const path = getLocationPath(db, pantry.id);
    expect(path.map((r) => r.name)).toEqual(['Home', 'Kitchen', 'Pantry']);
  });

  it('throws LocationNotFoundError when location is missing', () => {
    expect(() => getLocationPath(db, 'nope')).toThrowError(LocationNotFoundError);
  });
});

describe('createLocation', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('creates a root location with defaults', () => {
    const row = createLocation(db, { name: 'Home' });
    expect(row.name).toBe('Home');
    expect(row.parentId).toBeNull();
    expect(row.sortOrder).toBe(0);
  });

  it('creates a child location under an existing parent', () => {
    const parent = createLocation(db, { name: 'Home' });
    const child = createLocation(db, { name: 'Kitchen', parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
  });

  it('respects an explicit sortOrder', () => {
    const row = createLocation(db, { name: 'Garage', sortOrder: 5 });
    expect(row.sortOrder).toBe(5);
  });

  it('throws ParentLocationNotFoundError when parent is missing', () => {
    expect(() => createLocation(db, { name: 'Orphan', parentId: 'nope' })).toThrowError(
      ParentLocationNotFoundError
    );
  });
});

describe('updateLocation', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('renames a location', () => {
    const created = createLocation(db, { name: 'Bedoom' });
    const renamed = updateLocation(db, created.id, { name: 'Bedroom' });
    expect(renamed.name).toBe('Bedroom');
  });

  it('moves a location to a new parent', () => {
    const home = createLocation(db, { name: 'Home' });
    const garage = createLocation(db, { name: 'Garage' });
    const shelf = createLocation(db, { name: 'Shelf', parentId: home.id });

    const moved = updateLocation(db, shelf.id, { parentId: garage.id });
    expect(moved.parentId).toBe(garage.id);
  });

  it('moves a location to root', () => {
    const home = createLocation(db, { name: 'Home' });
    const room = createLocation(db, { name: 'Room', parentId: home.id });

    const moved = updateLocation(db, room.id, { parentId: null });
    expect(moved.parentId).toBeNull();
  });

  it('rejects making a location its own parent', () => {
    const home = createLocation(db, { name: 'Home' });
    expect(() => updateLocation(db, home.id, { parentId: home.id })).toThrowError(
      LocationSelfParentError
    );
  });

  it('rejects circular reference', () => {
    const parent = createLocation(db, { name: 'Parent' });
    const child = createLocation(db, { name: 'Child', parentId: parent.id });
    expect(() => updateLocation(db, parent.id, { parentId: child.id })).toThrowError(
      LocationCycleError
    );
  });

  it('throws LocationNotFoundError for missing id', () => {
    expect(() => updateLocation(db, 'nope', { name: 'X' })).toThrowError(LocationNotFoundError);
  });

  it('throws ParentLocationNotFoundError for missing parent', () => {
    const home = createLocation(db, { name: 'Home' });
    expect(() => updateLocation(db, home.id, { parentId: 'nope' })).toThrowError(
      ParentLocationNotFoundError
    );
  });
});

describe('deleteLocation', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('deletes an existing row', () => {
    const created = createLocation(db, { name: 'Temp' });
    deleteLocation(db, created.id);
    expect(() => getLocation(db, created.id)).toThrowError(LocationNotFoundError);
  });

  it('throws LocationNotFoundError when missing', () => {
    expect(() => deleteLocation(db, 'nope')).toThrowError(LocationNotFoundError);
  });
});

describe('getDescendantLocationIds', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty array for a leaf', () => {
    const leaf = createLocation(db, { name: 'Leaf' });
    expect(getDescendantLocationIds(db, leaf.id)).toEqual([]);
  });

  it('returns transitive descendants', () => {
    const home = createLocation(db, { name: 'Home' });
    const kitchen = createLocation(db, { name: 'Kitchen', parentId: home.id });
    const pantry = createLocation(db, { name: 'Pantry', parentId: kitchen.id });
    const bedroom = createLocation(db, { name: 'Bedroom', parentId: home.id });

    const ids = getDescendantLocationIds(db, home.id);
    expect(new Set(ids)).toEqual(new Set([kitchen.id, pantry.id, bedroom.id]));
  });
});

describe('getDeleteStats', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns zeros for an empty leaf', () => {
    const leaf = createLocation(db, { name: 'Empty' });
    expect(getDeleteStats(db, leaf.id)).toEqual({
      childCount: 0,
      descendantCount: 0,
      itemCount: 0,
      totalItemCount: 0,
    });
  });

  it('counts direct children and transitive descendants', () => {
    const home = createLocation(db, { name: 'Home' });
    const kitchen = createLocation(db, { name: 'Kitchen', parentId: home.id });
    createLocation(db, { name: 'Pantry', parentId: kitchen.id });
    createLocation(db, { name: 'Bedroom', parentId: home.id });

    const stats = getDeleteStats(db, home.id);
    expect(stats.childCount).toBe(2);
    expect(stats.descendantCount).toBe(3);
  });

  it('counts items in this location and descendants', () => {
    const home = createLocation(db, { name: 'Home' });
    const kitchen = createLocation(db, { name: 'Kitchen', parentId: home.id });

    seedItem(db, 'Fridge', kitchen.id);
    seedItem(db, 'Oven', kitchen.id);
    seedItem(db, 'Couch', home.id);

    const stats = getDeleteStats(db, home.id);
    expect(stats.itemCount).toBe(1);
    expect(stats.totalItemCount).toBe(3);
  });

  it('throws LocationNotFoundError for missing id', () => {
    expect(() => getDeleteStats(db, 'nope')).toThrowError(LocationNotFoundError);
  });
});

describe('getLocationItems', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns items directly in the location', () => {
    const kitchen = createLocation(db, { name: 'Kitchen' });
    seedItem(db, 'Fridge', kitchen.id);
    seedItem(db, 'Oven', kitchen.id);
    seedItem(db, 'Couch', null);

    const result = getLocationItems(db, {
      locationId: kitchen.id,
      includeChildren: false,
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.itemName).toSorted()).toEqual(['Fridge', 'Oven']);
  });

  it('includes descendant items when includeChildren is true', () => {
    const home = createLocation(db, { name: 'Home' });
    const kitchen = createLocation(db, { name: 'Kitchen', parentId: home.id });
    seedItem(db, 'Couch', home.id);
    seedItem(db, 'Fridge', kitchen.id);

    const result = getLocationItems(db, {
      locationId: home.id,
      includeChildren: true,
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(2);
  });

  it('respects limit + offset', () => {
    const kitchen = createLocation(db, { name: 'Kitchen' });
    for (let i = 0; i < 5; i++) seedItem(db, `Item ${i}`, kitchen.id);

    const page1 = getLocationItems(db, {
      locationId: kitchen.id,
      includeChildren: false,
      limit: 2,
      offset: 0,
    });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = getLocationItems(db, {
      locationId: kitchen.id,
      includeChildren: false,
      limit: 2,
      offset: 2,
    });
    expect(page2.rows).toHaveLength(2);
    expect(page2.rows[0]!.itemName).not.toBe(page1.rows[0]!.itemName);
  });

  it('throws LocationNotFoundError when location missing', () => {
    expect(() =>
      getLocationItems(db, {
        locationId: 'nope',
        includeChildren: false,
        limit: 50,
        offset: 0,
      })
    ).toThrowError(LocationNotFoundError);
  });
});
