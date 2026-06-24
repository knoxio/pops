/**
 * Tests for the cross-pillar URI denormalisation service helpers.
 * Pure DB + service layer.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { crossPillarUrisService } from '../index.js';
import { homeInventory } from '../schema.js';

import type { InventoryDb } from '../services/internal.js';

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
  location_id text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  last_edited_time text NOT NULL
);
CREATE INDEX idx_inventory_purchase_transaction_uri ON home_inventory (purchase_transaction_uri);
CREATE INDEX idx_inventory_owner_uri ON home_inventory (owner_uri);
`;

function freshDb(): InventoryDb {
  const raw = new Database(':memory:');
  raw.exec(HOME_INVENTORY_DDL);
  return drizzle(raw);
}

function seed(
  db: InventoryDb,
  id: string,
  uri: { purchase?: string | null; owner?: string | null } = {}
): void {
  db.insert(homeInventory)
    .values({
      id,
      itemName: `item-${id}`,
      lastEditedTime: '2026-06-15T00:00:00.000Z',
      purchaseTransactionUri: uri.purchase ?? null,
      ownerUri: uri.owner ?? null,
    })
    .run();
}

describe('crossPillarUrisService.listDistinct*', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns distinct non-null purchase transaction URIs', () => {
    seed(db, 'a', { purchase: 'pops://finance/transaction/x' });
    seed(db, 'b', { purchase: 'pops://finance/transaction/x' });
    seed(db, 'c', { purchase: 'pops://finance/transaction/y' });
    seed(db, 'd');

    const uris = crossPillarUrisService.listDistinctPurchaseTransactionUris(db);
    expect(uris.toSorted()).toEqual([
      'pops://finance/transaction/x',
      'pops://finance/transaction/y',
    ]);
  });

  it('returns distinct non-null owner URIs', () => {
    seed(db, 'a', { owner: 'pops://core/user/joao@example.com' });
    seed(db, 'b', { owner: 'pops://core/user/joao@example.com' });
    seed(db, 'c');

    const uris = crossPillarUrisService.listDistinctOwnerUris(db);
    expect(uris).toEqual(['pops://core/user/joao@example.com']);
  });
});

describe('crossPillarUrisService.markStale / clearStale', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('stamps every row pointing at the URI when marking purchase stale', () => {
    seed(db, 'a', { purchase: 'pops://finance/transaction/x' });
    seed(db, 'b', { purchase: 'pops://finance/transaction/x' });
    seed(db, 'c', { purchase: 'pops://finance/transaction/y' });

    const stamp = '2026-06-15T03:30:00.000Z';
    const changed = crossPillarUrisService.markPurchaseTransactionUriStale(
      db,
      'pops://finance/transaction/x',
      stamp
    );

    expect(changed).toBe(2);
    const stamps = db
      .select({
        id: homeInventory.id,
        s: homeInventory.purchaseTransactionStaleAt,
      })
      .from(homeInventory)
      .all();
    expect(stamps.find((r) => r.id === 'a')?.s).toBe(stamp);
    expect(stamps.find((r) => r.id === 'b')?.s).toBe(stamp);
    expect(stamps.find((r) => r.id === 'c')?.s).toBeNull();
  });

  it('clears purchase stale markers when the URI resolves again', () => {
    seed(db, 'a', { purchase: 'pops://finance/transaction/x' });
    crossPillarUrisService.markPurchaseTransactionUriStale(
      db,
      'pops://finance/transaction/x',
      '2026-06-14T00:00:00.000Z'
    );
    const cleared = crossPillarUrisService.clearPurchaseTransactionUriStale(
      db,
      'pops://finance/transaction/x'
    );
    expect(cleared).toBe(1);
    const stamps = db
      .select({ s: homeInventory.purchaseTransactionStaleAt })
      .from(homeInventory)
      .all();
    expect(stamps[0]?.s).toBeNull();
  });

  it('stamps + clears owner stale markers symmetrically', () => {
    seed(db, 'a', { owner: 'pops://core/user/u' });
    const stamp = '2026-06-15T03:30:00.000Z';
    expect(crossPillarUrisService.markOwnerUriStale(db, 'pops://core/user/u', stamp)).toBe(1);
    expect(db.select({ s: homeInventory.ownerStaleAt }).from(homeInventory).all()[0]?.s).toBe(
      stamp
    );
    expect(crossPillarUrisService.clearOwnerUriStale(db, 'pops://core/user/u')).toBe(1);
    expect(db.select({ s: homeInventory.ownerStaleAt }).from(homeInventory).all()[0]?.s).toBeNull();
  });
});
