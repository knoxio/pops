/**
 * Invariant tests for the connections service against an in-memory SQLite
 * seeded with the canonical `home_inventory` + `item_connections` tables.
 * Pure DB + service layer — no tRPC, no Express, no auth middleware.
 *
 * Higher-level integration coverage (auth, router, tRPC error mapping)
 * lives in pops-api's own suite; the writer move + reads cutover PRs
 * route those through `connectionsService.*`.
 *
 * The `home_inventory` and `item_connections` DDL is inlined here because
 * the canonical baseline migration (`0006_inventory_pillar_baseline`)
 * bundles unrelated FK tables. The locations migration is read from the
 * package's journal so the FK target exists.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { connectionsService } from '../index.js';
import {
  ConnectionConflictError,
  ConnectionItemNotFoundError,
  ConnectionNotFoundError,
  SelfConnectionError,
} from '../services/connections-errors.js';
import { create as createItem } from '../services/items.js';

import type { TraceNode } from '../services/connections-types.js';
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
`;

const ITEM_CONNECTIONS_DDL = `
CREATE TABLE item_connections (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  item_a_id text NOT NULL REFERENCES home_inventory(id) ON DELETE CASCADE,
  item_b_id text NOT NULL REFERENCES home_inventory(id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT chk_item_connections_order CHECK (item_a_id < item_b_id)
);
CREATE UNIQUE INDEX uq_item_connections_pair ON item_connections (item_a_id, item_b_id);
CREATE INDEX idx_item_connections_a ON item_connections (item_a_id);
CREATE INDEX idx_item_connections_b ON item_connections (item_b_id);
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
  raw.exec(ITEM_CONNECTIONS_DDL);
  return drizzle(raw);
}

/** Seed two items and return their IDs in sorted (A<B) order. */
function seedPair(db: InventoryDb, nameA = 'Item A', nameB = 'Item B'): [string, string] {
  const a = createItem(db, { itemName: nameA });
  const b = createItem(db, { itemName: nameB });
  return [a.id, b.id].toSorted() as [string, string];
}

describe('connectionsService.create', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('connects two items and returns the row with A<B ordering', () => {
    const [idA, idB] = seedPair(db);
    const row = connectionsService.create(db, { itemAId: idA, itemBId: idB });
    expect(row.itemAId).toBe(idA);
    expect(row.itemBId).toBe(idB);
    expect(typeof row.id).toBe('number');
    expect(row.createdAt).toBeTruthy();
  });

  it('normalises caller-provided reverse ordering to A<B', () => {
    const [idA, idB] = seedPair(db);
    const row = connectionsService.create(db, { itemAId: idB, itemBId: idA });
    expect(row.itemAId).toBe(idA);
    expect(row.itemBId).toBe(idB);
  });

  it('rejects connecting an item to itself with SelfConnectionError', () => {
    const item = createItem(db, { itemName: 'Solo' });
    expect(() =>
      connectionsService.create(db, { itemAId: item.id, itemBId: item.id })
    ).toThrowError(SelfConnectionError);
  });

  it('rejects duplicate pairs with ConnectionConflictError', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    expect(() => connectionsService.create(db, { itemAId: idA, itemBId: idB })).toThrowError(
      ConnectionConflictError
    );
  });

  it('rejects duplicate pairs in reverse order (same canonical pair)', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    expect(() => connectionsService.create(db, { itemAId: idB, itemBId: idA })).toThrowError(
      ConnectionConflictError
    );
  });

  it('throws ConnectionItemNotFoundError when itemA is missing', () => {
    const b = createItem(db, { itemName: 'B' });
    expect(() => connectionsService.create(db, { itemAId: 'nope', itemBId: b.id })).toThrowError(
      ConnectionItemNotFoundError
    );
  });

  it('throws ConnectionItemNotFoundError when itemB is missing', () => {
    const a = createItem(db, { itemName: 'A' });
    expect(() => connectionsService.create(db, { itemAId: a.id, itemBId: 'nope' })).toThrowError(
      ConnectionItemNotFoundError
    );
  });
});

describe('connectionsService.get', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the row for an existing pair (normalised)', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    const row = connectionsService.get(db, idB, idA);
    expect(row.itemAId).toBe(idA);
    expect(row.itemBId).toBe(idB);
  });

  it('throws ConnectionNotFoundError when no row matches', () => {
    const [idA, idB] = seedPair(db);
    expect(() => connectionsService.get(db, idA, idB)).toThrowError(ConnectionNotFoundError);
  });
});

describe('connectionsService.list', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty rows + zero total when the item has no connections', () => {
    const item = createItem(db, { itemName: 'Lonely' });
    const result = connectionsService.list(db, item.id, 50, 0);
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('returns rows where the item appears in column A', () => {
    const [idA, idB] = seedPair(db, 'AAA', 'ZZZ');
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    const result = connectionsService.list(db, idA, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]!.itemAId).toBe(idA);
    expect(result.rows[0]!.itemBId).toBe(idB);
  });

  it('returns rows where the item appears in column B', () => {
    const [idA, idB] = seedPair(db, 'AAA', 'ZZZ');
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    const result = connectionsService.list(db, idB, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]!.itemAId).toBe(idA);
    expect(result.rows[0]!.itemBId).toBe(idB);
  });

  it('paginates rows but reports the full total for the filter', () => {
    const hub = createItem(db, { itemName: 'Hub' });
    for (let i = 0; i < 3; i++) {
      const peer = createItem(db, { itemName: `Peer ${i}` });
      connectionsService.create(db, { itemAId: hub.id, itemBId: peer.id });
    }

    const page1 = connectionsService.list(db, hub.id, 2, 0);
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = connectionsService.list(db, hub.id, 2, 2);
    expect(page2.rows).toHaveLength(1);
    expect(page2.total).toBe(3);
  });
});

describe('connectionsService.delete', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('removes an existing connection by ordered pair', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    connectionsService.delete(db, idA, idB);
    expect(() => connectionsService.get(db, idA, idB)).toThrowError(ConnectionNotFoundError);
  });

  it('normalises reverse ordering before deleting', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });
    connectionsService.delete(db, idB, idA);
    expect(connectionsService.list(db, idA, 50, 0).total).toBe(0);
  });

  it('throws ConnectionNotFoundError when no row matches', () => {
    const [idA, idB] = seedPair(db);
    expect(() => connectionsService.delete(db, idA, idB)).toThrowError(ConnectionNotFoundError);
  });

  it('leaves unrelated connections untouched', () => {
    const a = createItem(db, { itemName: 'A' });
    const b = createItem(db, { itemName: 'B' });
    const c = createItem(db, { itemName: 'C' });

    const pairAB = [a.id, b.id].toSorted() as [string, string];
    const pairAC = [a.id, c.id].toSorted() as [string, string];
    connectionsService.create(db, { itemAId: pairAB[0], itemBId: pairAB[1] });
    connectionsService.create(db, { itemAId: pairAC[0], itemBId: pairAC[1] });

    connectionsService.delete(db, pairAB[0], pairAB[1]);

    expect(connectionsService.get(db, pairAC[0], pairAC[1]).itemAId).toBe(pairAC[0]);
  });
});

describe('connectionsService.trace', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns root with no children when the item has no connections', () => {
    const item = createItem(db, { itemName: 'Lonely' });
    const tree = connectionsService.trace(db, item.id, 10);
    expect(tree.id).toBe(item.id);
    expect(tree.itemName).toBe('Lonely');
    expect(tree.children).toEqual([]);
  });

  it('returns immediate neighbours as direct children', () => {
    const hub = createItem(db, { itemName: 'Hub' });
    const peer1 = createItem(db, { itemName: 'Peer 1' });
    const peer2 = createItem(db, { itemName: 'Peer 2' });
    connectionsService.create(db, { itemAId: hub.id, itemBId: peer1.id });
    connectionsService.create(db, { itemAId: hub.id, itemBId: peer2.id });

    const tree = connectionsService.trace(db, hub.id, 10);
    expect(tree.children).toHaveLength(2);
    expect(tree.children.map((c) => c.id).toSorted()).toEqual([peer1.id, peer2.id].toSorted());
  });

  it('traverses multi-hop chains recursively', () => {
    const a = createItem(db, { itemName: 'A' });
    const b = createItem(db, { itemName: 'B' });
    const c = createItem(db, { itemName: 'C' });
    const d = createItem(db, { itemName: 'D' });

    const pairs = [
      [a.id, b.id],
      [b.id, c.id],
      [c.id, d.id],
    ];
    for (const [x, y] of pairs) {
      const sorted = [x!, y!].toSorted() as [string, string];
      connectionsService.create(db, { itemAId: sorted[0], itemBId: sorted[1] });
    }

    const tree = connectionsService.trace(db, a.id, 10);
    expect(tree.children).toHaveLength(1);
    const nodeB = tree.children[0]!;
    expect(nodeB.id).toBe(b.id);
    const nodeC = nodeB.children[0]!;
    expect(nodeC.id).toBe(c.id);
    const nodeD = nodeC.children[0]!;
    expect(nodeD.id).toBe(d.id);
    expect(nodeD.children).toEqual([]);
  });

  it('caps depth at maxDepth', () => {
    const a = createItem(db, { itemName: 'A' });
    const b = createItem(db, { itemName: 'B' });
    const c = createItem(db, { itemName: 'C' });

    const pairAB = [a.id, b.id].toSorted() as [string, string];
    const pairBC = [b.id, c.id].toSorted() as [string, string];
    connectionsService.create(db, { itemAId: pairAB[0], itemBId: pairAB[1] });
    connectionsService.create(db, { itemAId: pairBC[0], itemBId: pairBC[1] });

    const tree = connectionsService.trace(db, a.id, 1);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]!.id).toBe(b.id);
    expect(tree.children[0]!.children).toEqual([]);
  });

  it('breaks cycles in a triangle so each node appears at most once', () => {
    const a = createItem(db, { itemName: 'A' });
    const b = createItem(db, { itemName: 'B' });
    const c = createItem(db, { itemName: 'C' });

    for (const [x, y] of [
      [a.id, b.id],
      [a.id, c.id],
      [b.id, c.id],
    ]) {
      const sorted = [x!, y!].toSorted() as [string, string];
      connectionsService.create(db, { itemAId: sorted[0], itemBId: sorted[1] });
    }

    const tree = connectionsService.trace(db, a.id, 10);

    function countNodes(node: TraceNode): number {
      return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
    }
    expect(countNodes(tree)).toBe(3);
  });

  it('throws ConnectionItemNotFoundError when the root is missing', () => {
    expect(() => connectionsService.trace(db, 'nope', 10)).toThrowError(
      ConnectionItemNotFoundError
    );
  });
});

describe('connectionsService.graph', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns a single-node subgraph when the item has no connections', () => {
    const item = createItem(db, { itemName: 'Lonely' });
    const result = connectionsService.graph(db, item.id, 10);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.id).toBe(item.id);
    expect(result.edges).toEqual([]);
  });

  it('includes cross-links between visited nodes (triangle)', () => {
    const a = createItem(db, { itemName: 'A' });
    const b = createItem(db, { itemName: 'B' });
    const c = createItem(db, { itemName: 'C' });

    for (const [x, y] of [
      [a.id, b.id],
      [a.id, c.id],
      [b.id, c.id],
    ]) {
      const sorted = [x!, y!].toSorted() as [string, string];
      connectionsService.create(db, { itemAId: sorted[0], itemBId: sorted[1] });
    }

    const result = connectionsService.graph(db, a.id, 10);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(3);
  });

  it('respects maxDepth', () => {
    const a = createItem(db, { itemName: 'A' });
    const b = createItem(db, { itemName: 'B' });
    const c = createItem(db, { itemName: 'C' });

    const pairAB = [a.id, b.id].toSorted() as [string, string];
    const pairBC = [b.id, c.id].toSorted() as [string, string];
    connectionsService.create(db, { itemAId: pairAB[0], itemBId: pairAB[1] });
    connectionsService.create(db, { itemAId: pairBC[0], itemBId: pairBC[1] });

    const result = connectionsService.graph(db, a.id, 1);
    expect(result.nodes.map((n) => n.id).toSorted()).toEqual([a.id, b.id].toSorted());
  });

  it('emits edges in canonical A<B (source<target) ordering', () => {
    const [idA, idB] = seedPair(db);
    connectionsService.create(db, { itemAId: idA, itemBId: idB });

    const result = connectionsService.graph(db, idA, 10);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]!.source).toBe(idA);
    expect(result.edges[0]!.target).toBe(idB);
  });

  it('includes node metadata (itemName, assetId, type)', () => {
    const item = createItem(db, {
      itemName: 'MacBook Pro',
      assetId: 'ASSET-001',
      type: 'electronics',
    });

    const result = connectionsService.graph(db, item.id, 10);
    expect(result.nodes[0]).toMatchObject({
      id: item.id,
      itemName: 'MacBook Pro',
      assetId: 'ASSET-001',
      type: 'electronics',
    });
  });

  it('throws ConnectionItemNotFoundError when the root is missing', () => {
    expect(() => connectionsService.graph(db, 'nope', 10)).toThrowError(
      ConnectionItemNotFoundError
    );
  });
});

describe('connectionsService.toConnection', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('maps a row to the public API shape', () => {
    const [idA, idB] = seedPair(db);
    const row = connectionsService.create(db, { itemAId: idA, itemBId: idB });
    const dto = connectionsService.toConnection(row);
    expect(dto).toEqual({
      id: row.id,
      itemAId: idA,
      itemBId: idB,
      createdAt: row.createdAt,
    });
  });
});
