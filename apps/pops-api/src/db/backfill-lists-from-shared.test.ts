/**
 * Boot-time backfill tests for `backfillListsFromShared` (phase 2 PR 3).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `lists.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the per-table WHERE filter dedupes),
 *   - mixed state (some rows already in lists) only inserts the missing ones,
 *   - children copy AFTER parents (FK order matters under `foreign_keys=ON`),
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openListsDb } from '@pops/lists-db';

import { backfillListsFromShared } from './backfill-lists-from-shared.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lists-backfill-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const LISTS_SQL = `
CREATE TABLE lists (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  owner_app text NOT NULL,
  archived_at text,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  CONSTRAINT "ck_lists_kind" CHECK("lists"."kind" IN ('shopping','packing','todo','generic'))
);
CREATE INDEX idx_lists_kind ON lists (kind);
CREATE INDEX idx_lists_owner_app ON lists (owner_app);
CREATE TABLE list_items (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  list_id integer NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  label text NOT NULL,
  qty real,
  unit text,
  ref_kind text DEFAULT 'free' NOT NULL,
  ref_id integer,
  checked integer DEFAULT 0 NOT NULL,
  checked_at text,
  due_at text,
  notes text,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON UPDATE no action ON DELETE no action,
  CONSTRAINT "ck_list_items_ref_kind" CHECK("list_items"."ref_kind" IN ('free','ingredient','variant','recipe','custom')),
  CONSTRAINT "ck_list_items_checked" CHECK("list_items"."checked" IN (0,1))
);
CREATE INDEX idx_list_items_list ON list_items (list_id);
CREATE INDEX idx_list_items_checked ON list_items (list_id, checked);
CREATE INDEX idx_list_items_ref ON list_items (ref_kind, ref_id) WHERE ref_id IS NOT NULL;
`;

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(LISTS_SQL);
  seed(raw);
  raw.close();
  return path;
}

function insertList(
  raw: BetterSqlite3.Database,
  id: number,
  name: string,
  kind: 'shopping' | 'packing' | 'todo' | 'generic' = 'shopping',
  ownerApp = 'user'
): void {
  raw
    .prepare(
      "INSERT INTO lists (id, name, kind, owner_app, created_at) VALUES (?, ?, ?, ?, '2026-06-10T00:00:00Z')"
    )
    .run(id, name, kind, ownerApp);
}

function insertItem(
  raw: BetterSqlite3.Database,
  id: number,
  listId: number,
  label: string,
  position = 0
): void {
  raw
    .prepare(
      "INSERT INTO list_items (id, list_id, position, label, ref_kind, checked, created_at) VALUES (?, ?, ?, ?, 'free', 0, '2026-06-10T00:00:00Z')"
    )
    .run(id, listId, position, label);
}

describe('backfillListsFromShared', () => {
  it('copies lists rows from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => insertList(raw, 1, 'Groceries'));

    const lists = openListsDb(join(tmpDir, 'lists.db'));
    try {
      backfillListsFromShared(lists, sharedPath);
      const { n } = lists.raw.prepare('SELECT count(*) AS n FROM lists').get() as { n: number };
      expect(n).toBe(1);
    } finally {
      lists.raw.close();
    }
  });

  it('copies list_items rows in FK-safe order after their parent lists', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertList(raw, 1, 'Groceries');
      insertItem(raw, 10, 1, 'milk', 0);
      insertItem(raw, 11, 1, 'bread', 1);
    });

    const lists = openListsDb(join(tmpDir, 'lists.db'));
    try {
      backfillListsFromShared(lists, sharedPath);
      const items = lists.raw
        .prepare('SELECT id, list_id, label, position FROM list_items ORDER BY id')
        .all() as { id: number; list_id: number; label: string; position: number }[];
      expect(items).toEqual([
        { id: 10, list_id: 1, label: 'milk', position: 0 },
        { id: 11, list_id: 1, label: 'bread', position: 1 },
      ]);
    } finally {
      lists.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate rows', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertList(raw, 1, 'Groceries');
      insertItem(raw, 10, 1, 'milk');
    });

    const lists = openListsDb(join(tmpDir, 'lists.db'));
    try {
      backfillListsFromShared(lists, sharedPath);
      backfillListsFromShared(lists, sharedPath);
      const { listsCount } = lists.raw
        .prepare('SELECT count(*) AS listsCount FROM lists')
        .get() as { listsCount: number };
      const { itemsCount } = lists.raw
        .prepare('SELECT count(*) AS itemsCount FROM list_items')
        .get() as { itemsCount: number };
      expect(listsCount).toBe(1);
      expect(itemsCount).toBe(1);
    } finally {
      lists.raw.close();
    }
  });

  it('only inserts rows missing from the lists copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertList(raw, 1, 'Groceries');
      insertList(raw, 2, 'Packing');
      insertItem(raw, 10, 1, 'milk');
      insertItem(raw, 11, 2, 'socks');
    });

    const lists = openListsDb(join(tmpDir, 'lists.db'));
    try {
      insertList(lists.raw, 1, 'Groceries');
      insertItem(lists.raw, 10, 1, 'milk');
      backfillListsFromShared(lists, sharedPath);
      const listRows = lists.raw.prepare('SELECT id, name FROM lists ORDER BY id').all() as {
        id: number;
        name: string;
      }[];
      const itemRows = lists.raw.prepare('SELECT id, label FROM list_items ORDER BY id').all() as {
        id: number;
        label: string;
      }[];
      expect(listRows.map((r) => r.id)).toEqual([1, 2]);
      expect(itemRows.map((r) => r.id)).toEqual([10, 11]);
    } finally {
      lists.raw.close();
    }
  });

  it('tolerates a shared DB with no lists tables (post-PR-4 drop scenario)', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const lists = openListsDb(join(tmpDir, 'lists.db'));
    try {
      expect(() => backfillListsFromShared(lists, sharedPath)).not.toThrow();
      const { n } = lists.raw.prepare('SELECT count(*) AS n FROM lists').get() as { n: number };
      expect(n).toBe(0);
    } finally {
      lists.raw.close();
    }
  });
});
