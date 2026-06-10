/**
 * Lists-db Phase 1 PR 1 invariant tests — exercise the package-local
 * migration journal + the list-items read / check slice against an in-memory
 * SQLite. No Redis, no API process, no external services.
 *
 * The tests apply the package-local migration copy (not the shared journal)
 * so the suite stays self-describing — if the drift-guard CI flags the two
 * copies as divergent, this test pivots from "schema is canonical" to
 * "schema matches what the package shipped".
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { ListItemNotFoundError } from '../errors.js';
import { listItemsService, type ListsDb } from '../index.js';
import { lists } from '../schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  join(HERE, '..', '..', 'migrations', '0062_chemical_donald_blake.sql'),
  'utf8'
);

function freshDb(): { db: ListsDb; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const stmts = MIGRATION_SQL.split('--> statement-breakpoint');
  for (const stmt of stmts) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return { db: drizzle(raw), raw };
}

function seedList(db: ListsDb): number {
  const rows = db
    .insert(lists)
    .values({ name: 'Test list', kind: 'shopping', ownerApp: 'tests' })
    .returning()
    .all();
  const first = rows[0];
  if (first === undefined) {
    throw new Error('seedList: insert did not return a row');
  }
  return first.id;
}

describe('@pops/lists-db — package-local migration applies cleanly', () => {
  it('creates the `lists` and `list_items` tables', () => {
    const { raw } = freshDb();
    const tables = raw
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['lists', 'list_items']));
  });

  it('creates the partial index `idx_list_items_ref` with WHERE ref_id IS NOT NULL', () => {
    const { raw } = freshDb();
    const partial = raw
      .prepare(`SELECT sql FROM sqlite_master WHERE name='idx_list_items_ref'`)
      .get() as { sql: string } | undefined;
    expect(partial?.sql).toMatch(/WHERE.*ref_id.*IS NOT NULL/i);
  });
});

describe('@pops/lists-db — listItemsService surface', () => {
  let db: ListsDb;
  let raw: Database.Database;
  let listId: number;

  beforeEach(() => {
    ({ db, raw } = freshDb());
    listId = seedList(db);
  });

  function insertItem(label: string, position: number): number {
    const info = raw
      .prepare(
        `INSERT INTO list_items (list_id, position, label, ref_kind, checked) VALUES (?, ?, ?, 'free', 0)`
      )
      .run(listId, position, label);
    return Number(info.lastInsertRowid);
  }

  describe('listItemsForList', () => {
    it('returns rows ordered by position then id', () => {
      insertItem('second', 1);
      insertItem('first', 0);
      insertItem('third', 2);
      const rows = listItemsService.listItemsForList(db, listId);
      expect(rows.map((r) => r.label)).toEqual(['first', 'second', 'third']);
    });

    it('returns an empty array when the list has no items', () => {
      const rows = listItemsService.listItemsForList(db, listId);
      expect(rows).toEqual([]);
    });

    it('is scoped to the target list', () => {
      const other = seedList(db);
      insertItem('a', 0);
      raw
        .prepare(
          `INSERT INTO list_items (list_id, position, label, ref_kind, checked) VALUES (?, 0, 'b', 'free', 0)`
        )
        .run(other);
      const rows = listItemsService.listItemsForList(db, listId);
      expect(rows.map((r) => r.label)).toEqual(['a']);
    });

    it('falls back to id ordering when two rows share a position', () => {
      const firstId = insertItem('a', 0);
      const secondId = insertItem('b', 0);
      const rows = listItemsService.listItemsForList(db, listId);
      expect(rows.map((r) => r.id)).toEqual([firstId, secondId]);
    });
  });

  describe('getListItem', () => {
    it('returns the matching row', () => {
      const id = insertItem('milk', 0);
      const row = listItemsService.getListItem(db, id);
      expect(row.id).toBe(id);
      expect(row.label).toBe('milk');
      expect(row.checked).toBe(0);
      expect(row.checkedAt).toBeNull();
    });

    it('throws ListItemNotFoundError on an unknown id', () => {
      expect(() => listItemsService.getListItem(db, 9999)).toThrow(ListItemNotFoundError);
      try {
        listItemsService.getListItem(db, 9999);
      } catch (err) {
        if (err instanceof ListItemNotFoundError) {
          expect(err.itemId).toBe(9999);
          expect(err.name).toBe('ListItemNotFoundError');
        } else {
          throw err;
        }
      }
    });
  });

  describe('checkListItem', () => {
    it('flips checked to 1 and stamps checked_at', () => {
      const id = insertItem('milk', 0);
      const row = listItemsService.checkListItem(db, id);
      expect(row.checked).toBe(1);
      expect(row.checkedAt).not.toBeNull();
      expect(Date.parse(row.checkedAt ?? '')).not.toBeNaN();
    });

    it('refreshes checked_at when re-checking an already-checked row', async () => {
      const id = insertItem('milk', 0);
      const first = listItemsService.checkListItem(db, id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = listItemsService.checkListItem(db, id);
      expect(second.checked).toBe(1);
      expect(second.checkedAt).not.toBe(first.checkedAt);
    });

    it('throws ListItemNotFoundError on an unknown id', () => {
      expect(() => listItemsService.checkListItem(db, 9999)).toThrow(ListItemNotFoundError);
    });
  });

  describe('uncheckListItem', () => {
    it('clears checked + checked_at on a previously-checked row', () => {
      const id = insertItem('milk', 0);
      listItemsService.checkListItem(db, id);
      const row = listItemsService.uncheckListItem(db, id);
      expect(row.checked).toBe(0);
      expect(row.checkedAt).toBeNull();
    });

    it('is idempotent on an already-unchecked row', () => {
      const id = insertItem('milk', 0);
      const row = listItemsService.uncheckListItem(db, id);
      expect(row.checked).toBe(0);
      expect(row.checkedAt).toBeNull();
    });

    it('throws ListItemNotFoundError on an unknown id', () => {
      expect(() => listItemsService.uncheckListItem(db, 9999)).toThrow(ListItemNotFoundError);
    });
  });

  describe('uncheckAllListItems', () => {
    it('flips every checked row in the target list + returns the count', () => {
      const a = insertItem('a', 0);
      const b = insertItem('b', 1);
      const c = insertItem('c', 2);
      listItemsService.checkListItem(db, a);
      listItemsService.checkListItem(db, b);
      const count = listItemsService.uncheckAllListItems(db, listId);
      expect(count).toBe(2);
      const rows = listItemsService.listItemsForList(db, listId);
      expect(rows.every((r) => r.checked === 0)).toBe(true);
      expect(rows.every((r) => r.checkedAt === null)).toBe(true);
      const cRow = rows.find((r) => r.id === c);
      expect(cRow?.checked).toBe(0);
    });

    it('returns 0 when nothing is checked', () => {
      insertItem('a', 0);
      insertItem('b', 1);
      expect(listItemsService.uncheckAllListItems(db, listId)).toBe(0);
    });

    it('is scoped to the target list', () => {
      const other = seedList(db);
      const aId = insertItem('a', 0);
      const otherInsert = raw
        .prepare(
          `INSERT INTO list_items (list_id, position, label, ref_kind, checked) VALUES (?, 0, 'b', 'free', 0)`
        )
        .run(other);
      const otherItemId = Number(otherInsert.lastInsertRowid);
      listItemsService.checkListItem(db, aId);
      listItemsService.checkListItem(db, otherItemId);
      expect(listItemsService.uncheckAllListItems(db, listId)).toBe(1);
      const refreshed = listItemsService.getListItem(db, otherItemId);
      expect(refreshed.checked).toBe(1);
    });
  });
});
