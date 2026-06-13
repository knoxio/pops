/**
 * Boot-time backfill tests for `backfillInventoryFromShared` (phase 2 PR 3).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `inventory.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the per-table WHERE filter dedupes),
 *   - mixed state (some rows already in inventory) only inserts the missing ones,
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb } from '@pops/inventory-db';

import { backfillInventoryFromShared } from './backfill-inventory-from-shared.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-backfill-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const HOME_INVENTORY_SQL = `
CREATE TABLE home_inventory (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
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
  purchased_from_id text,
  purchased_from_name text,
  purchase_price real,
  asset_id text,
  notes text,
  location_id text,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  updated_at text DEFAULT (datetime('now')) NOT NULL,
  last_edited_time text NOT NULL
);
`;

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(HOME_INVENTORY_SQL);
  seed(raw);
  raw.close();
  return path;
}

describe('backfillInventoryFromShared', () => {
  it('copies home_inventory rows from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-1', 'Couch', '2026-06-10T00:00:00Z')`
      );
    });

    const inventory = openInventoryDb(join(tmpDir, 'inventory.db'));
    try {
      backfillInventoryFromShared(inventory, sharedPath);
      const itemCount = inventory.raw.prepare('SELECT count(*) AS n FROM home_inventory').get() as {
        n: number;
      };
      expect(itemCount.n).toBe(1);
    } finally {
      inventory.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate rows', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-1', 'Couch', '2026-06-10T00:00:00Z')`
      );
    });

    const inventory = openInventoryDb(join(tmpDir, 'inventory.db'));
    try {
      backfillInventoryFromShared(inventory, sharedPath);
      backfillInventoryFromShared(inventory, sharedPath);
      const itemCount = inventory.raw.prepare('SELECT count(*) AS n FROM home_inventory').get() as {
        n: number;
      };
      expect(itemCount.n).toBe(1);
    } finally {
      inventory.raw.close();
    }
  });

  it('only inserts rows missing from the inventory copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-shared-only', 'Lamp', '2026-06-10T00:00:00Z')`
      );
      raw.exec(
        `INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-both', 'Couch', '2026-06-10T00:00:00Z')`
      );
    });

    const inventory = openInventoryDb(join(tmpDir, 'inventory.db'));
    try {
      inventory.raw.exec(
        `INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-both', 'Couch', '2026-06-10T00:00:00Z')`
      );
      backfillInventoryFromShared(inventory, sharedPath);
      const rows = inventory.raw.prepare('SELECT id FROM home_inventory ORDER BY id').all() as {
        id: string;
      }[];
      expect(rows.map((r) => r.id)).toEqual(['item-both', 'item-shared-only']);
    } finally {
      inventory.raw.close();
    }
  });

  it('tolerates a shared DB with no inventory tables (post-PR-4 drop scenario)', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const inventory = openInventoryDb(join(tmpDir, 'inventory.db'));
    try {
      expect(() => backfillInventoryFromShared(inventory, sharedPath)).not.toThrow();
      const itemCount = inventory.raw.prepare('SELECT count(*) AS n FROM home_inventory').get() as {
        n: number;
      };
      expect(itemCount.n).toBe(0);
    } finally {
      inventory.raw.close();
    }
  });
});
