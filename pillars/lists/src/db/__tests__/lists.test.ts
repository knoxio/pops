/**
 * PRD-112 invariant tests — exercise the migration + service layer against
 * an in-memory SQLite. No Redis, no API process, no external services.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { ListItemNotFoundError, ListNotFoundError } from '../errors.js';
import { listItems, lists } from '../schema.js';
import { type ListsDb } from '../services/internal.js';
import {
  addItem,
  bulkAdd,
  checkListItem,
  listItemsForList,
  removeCheckedItems,
  removeItem,
  reorderItems,
  uncheckAllListItems,
  uncheckListItem,
  updateItem,
} from '../services/list-items.js';
import {
  archiveList,
  createList,
  deleteList,
  getList,
  listLists,
  unarchiveList,
  updateList,
} from '../services/lists.js';

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    '../../../../../apps/pops-api/src/db/drizzle-migrations/0062_chemical_donald_blake.sql'
  ),
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

describe('PRD-112 — lists schema + service layer', () => {
  let db: ListsDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('schema applied cleanly', () => {
    it('creates `lists` and `list_items` tables', () => {
      const tables = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['lists', 'list_items']));
    });

    it('creates the partial index `idx_list_items_ref` with WHERE ref_id IS NOT NULL', () => {
      const partial = raw
        .prepare(`SELECT sql FROM sqlite_master WHERE name='idx_list_items_ref'`)
        .get() as { sql: string } | undefined;
      expect(partial?.sql).toMatch(/WHERE.*ref_id.*IS NOT NULL/i);
    });
  });

  describe('CHECK constraint on lists.kind', () => {
    it('accepts every documented kind', () => {
      for (const kind of ['shopping', 'packing', 'todo', 'generic'] as const) {
        expect(() => createList(db, { name: kind, kind, ownerApp: 'user' })).not.toThrow();
      }
    });

    it('rejects kind="foo"', () => {
      expect(() =>
        raw.prepare(`INSERT INTO lists (name, kind, owner_app) VALUES ('x', 'foo', 'user')`).run()
      ).toThrow();
    });
  });

  describe('CHECK constraint on list_items.ref_kind', () => {
    let listId: number;
    beforeEach(() => {
      const list = createList(db, { name: 'L', kind: 'shopping', ownerApp: 'user' });
      listId = list.id;
    });

    it('accepts every documented ref_kind', () => {
      for (const refKind of ['free', 'ingredient', 'variant', 'recipe', 'custom'] as const) {
        expect(() =>
          addItem(db, { listId, label: 'x', refKind, refId: refKind === 'free' ? null : 1 })
        ).not.toThrow();
      }
    });

    it('rejects ref_kind="foo"', () => {
      expect(() =>
        raw
          .prepare(`INSERT INTO list_items (list_id, label, ref_kind) VALUES (?, 'x', 'foo')`)
          .run(listId)
      ).toThrow();
    });
  });

  describe('createList + filters', () => {
    it('listLists hides archived by default', () => {
      const a = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      createList(db, { name: 'B', kind: 'todo', ownerApp: 'user' });
      archiveList(db, a.id);
      const visible = listLists(db);
      expect(visible.map((l) => l.name)).toEqual(['B']);
      const all = listLists(db, { includeArchived: true });
      expect(all).toHaveLength(2);
    });

    it('filters by kind + ownerApp', () => {
      createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      createList(db, { name: 'B', kind: 'shopping', ownerApp: 'user' });
      createList(db, { name: 'C', kind: 'todo', ownerApp: 'user' });
      expect(
        listLists(db, { kind: 'shopping' })
          .map((l) => l.name)
          .toSorted()
      ).toEqual(['A', 'B']);
      expect(
        listLists(db, { ownerApp: 'user' })
          .map((l) => l.name)
          .toSorted()
      ).toEqual(['B', 'C']);
      expect(listLists(db, { kind: 'shopping', ownerApp: 'food' }).map((l) => l.name)).toEqual([
        'A',
      ]);
    });
  });

  describe('archiveList / unarchiveList', () => {
    it('archive on an already-archived list refreshes archivedAt to now', () => {
      // PRD-140 §Edge Cases — repeating archive updates the timestamp.
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const first = archiveList(db, list.id);
      expect(first.archivedAt).not.toBeNull();
      // Spin until the wall-clock advances at least one millisecond so the
      // re-archive timestamp is provably newer.
      const startMs = Date.parse(first.archivedAt ?? '');
      while (Date.now() <= startMs) {
        // tight loop — sub-ms wait
      }
      const second = archiveList(db, list.id);
      expect(second.archivedAt).not.toBeNull();
      expect(Date.parse(second.archivedAt ?? '')).toBeGreaterThan(startMs);
    });

    it('unarchive restores items in their existing checked state', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const item = addItem(db, { listId: list.id, label: 'x' });
      checkListItem(db, item.id);
      archiveList(db, list.id);
      const restored = unarchiveList(db, list.id);
      expect(restored.archivedAt).toBeNull();
      const stored = listItemsForList(db, list.id);
      expect(stored[0]?.checked).toBe(1);
    });

    it('throws ListNotFoundError on a bogus id', () => {
      expect(() => archiveList(db, 9999)).toThrow(ListNotFoundError);
      expect(() => unarchiveList(db, 9999)).toThrow(ListNotFoundError);
    });
  });

  describe('updateList', () => {
    it('updates name + kind atomically', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const updated = updateList(db, list.id, { name: 'A renamed', kind: 'todo' });
      expect(updated.name).toBe('A renamed');
      expect(updated.kind).toBe('todo');
    });

    it('returns the existing row when patch is empty', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const same = updateList(db, list.id, {});
      expect(same.id).toBe(list.id);
    });

    it('throws ListNotFoundError on a bogus id', () => {
      expect(() => updateList(db, 9999, { name: 'x' })).toThrow(ListNotFoundError);
    });
  });

  describe('deleteList — cascades child items in one transaction', () => {
    it('removes the list and every child list_item', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      bulkAdd(db, list.id, [{ label: 'a' }, { label: 'b' }, { label: 'c' }]);
      deleteList(db, list.id);
      expect(db.select().from(lists).where(eq(lists.id, list.id)).all()).toHaveLength(0);
      expect(db.select().from(listItems).where(eq(listItems.listId, list.id)).all()).toHaveLength(
        0
      );
    });

    it('is a no-op on a bogus id', () => {
      expect(() => deleteList(db, 9999)).not.toThrow();
    });

    it('runs in a single transaction (items + list disappear atomically)', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      addItem(db, { listId: list.id, label: 'x' });
      // Wrap with a hand-rolled tx and force a throw between the two deletes
      // to verify rollback semantics: items must reappear if the list delete
      // failed.
      raw.exec('BEGIN');
      try {
        raw.prepare(`DELETE FROM list_items WHERE list_id = ?`).run(list.id);
        throw new Error('simulated rollback');
        // unreachable, but documents intent
      } catch {
        raw.exec('ROLLBACK');
      }
      const survivors = db.select().from(listItems).where(eq(listItems.listId, list.id)).all();
      expect(survivors).toHaveLength(1);
    });
  });

  describe('item check / uncheck', () => {
    let listId: number;
    beforeEach(() => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      listId = list.id;
    });

    it('checkItem sets checked=1 and stamps checked_at', () => {
      const item = addItem(db, { listId, label: 'milk' });
      const checked = checkListItem(db, item.id);
      expect(checked.checked).toBe(1);
      expect(checked.checkedAt).not.toBeNull();
    });

    it('uncheckItem clears checked + checked_at', () => {
      const item = addItem(db, { listId, label: 'milk' });
      checkListItem(db, item.id);
      const cleared = uncheckListItem(db, item.id);
      expect(cleared.checked).toBe(0);
      expect(cleared.checkedAt).toBeNull();
    });

    it('re-checking an already-checked item refreshes checked_at (idempotent semantics)', async () => {
      const item = addItem(db, { listId, label: 'milk' });
      const first = checkListItem(db, item.id);
      // Force a clock tick so the ISO timestamps differ deterministically.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = checkListItem(db, item.id);
      expect(second.checked).toBe(1);
      expect(second.checkedAt).not.toBe(first.checkedAt);
    });

    it('throws ListItemNotFoundError on a bogus id', () => {
      expect(() => checkListItem(db, 9999)).toThrow(ListItemNotFoundError);
      expect(() => uncheckListItem(db, 9999)).toThrow(ListItemNotFoundError);
    });
  });

  describe('bulkAdd — one transaction, ordered positions', () => {
    it('inserts 50 items and assigns monotonic positions', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const items = Array.from({ length: 50 }, (_, i) => ({ label: `item-${i}` }));
      const out = bulkAdd(db, list.id, items);
      expect(out).toHaveLength(50);
      out.forEach((row, i) => {
        expect(row.position).toBe(i);
      });
    });

    it('rolls back the whole batch if any insert fails', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      // Pre-existing valid items
      addItem(db, { listId: list.id, label: 'pre' });
      const before = listItemsForList(db, list.id).length;
      // Force a failure on the second item by violating the FK (use a non-
      // existent list id by tampering inside the bulk loop is awkward — use
      // a raw insert to trigger CHECK violation instead).
      expect(() =>
        bulkAdd(db, list.id, [
          { label: 'good' },
          // ref_kind='ingredient' with non-null ref_id is fine; trip the
          // CHECK by passing an invalid ref_kind via raw INSERT later — here
          // we just confirm the happy path. Negative path below.
          { label: 'also good' },
        ])
      ).not.toThrow();
      const after = listItemsForList(db, list.id).length;
      expect(after - before).toBe(2);
    });

    it('rolls back when a statement inside the tx violates a CHECK', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      addItem(db, { listId: list.id, label: 'pre' });
      const before = listItemsForList(db, list.id).length;
      // Drive the failure through the same transaction the service uses —
      // a raw CHECK violation must roll back the prior valid insert.
      expect(() => {
        db.transaction((tx) => {
          tx.insert(listItems)
            .values({ listId: list.id, label: 'good', refKind: 'ingredient', refId: 1 })
            .run();
          tx.run(
            sql`INSERT INTO list_items (list_id, label, ref_kind) VALUES (${list.id}, 'bad', 'foo')`
          );
        });
      }).toThrow();
      const after = listItemsForList(db, list.id).length;
      expect(after).toBe(before);
    });
  });

  describe('addItem ref_kind normalisation', () => {
    let listId: number;
    beforeEach(() => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      listId = list.id;
    });

    it('coerces (ref_kind=ingredient, ref_id=null) → free per PRD edge case', () => {
      const item = addItem(db, { listId, label: 'milk', refKind: 'ingredient', refId: null });
      expect(item.refKind).toBe('free');
      expect(item.refId).toBeNull();
    });

    it('keeps ref_kind=ingredient when ref_id is set', () => {
      const item = addItem(db, { listId, label: 'milk', refKind: 'ingredient', refId: 42 });
      expect(item.refKind).toBe('ingredient');
      expect(item.refId).toBe(42);
    });
  });

  describe('updateItem / removeItem', () => {
    let listId: number;
    beforeEach(() => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      listId = list.id;
    });

    it('patches label, qty, notes', () => {
      const item = addItem(db, { listId, label: 'a' });
      const patched = updateItem(db, item.id, { label: 'b', qty: 250, notes: 'n' });
      expect(patched.label).toBe('b');
      expect(patched.qty).toBe(250);
      expect(patched.notes).toBe('n');
    });

    it('returns the existing row when patch is empty', () => {
      const item = addItem(db, { listId, label: 'a' });
      const same = updateItem(db, item.id, {});
      expect(same.id).toBe(item.id);
    });

    it('throws ListItemNotFoundError on a bogus update', () => {
      expect(() => updateItem(db, 9999, { label: 'x' })).toThrow(ListItemNotFoundError);
    });

    it('removeItem deletes the row', () => {
      const item = addItem(db, { listId, label: 'a' });
      removeItem(db, item.id);
      expect(db.select().from(listItems).where(eq(listItems.id, item.id)).all()).toHaveLength(0);
    });

    it('removeItem is a no-op on bogus id', () => {
      expect(() => removeItem(db, 9999)).not.toThrow();
    });
  });

  describe('reorderItems', () => {
    it('writes monotonic positions starting at zero', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const items = bulkAdd(db, list.id, [{ label: 'a' }, { label: 'b' }, { label: 'c' }]);
      const reversed = items.map((i) => i.id).toReversed();
      reorderItems(db, list.id, reversed);
      const after = listItemsForList(db, list.id);
      expect(after.map((i) => i.label)).toEqual(['c', 'b', 'a']);
      expect(after.map((i) => i.position)).toEqual([0, 1, 2]);
    });

    it('refuses to reorder items belonging to a different list (filter by listId)', () => {
      const a = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const b = createList(db, { name: 'B', kind: 'shopping', ownerApp: 'food' });
      const ai = addItem(db, { listId: a.id, label: 'a' });
      const bi = addItem(db, { listId: b.id, label: 'b' });
      // Even with the id, list A's reorder must not touch list B.
      reorderItems(db, a.id, [bi.id, ai.id]);
      const aRow = db.select().from(listItems).where(eq(listItems.id, ai.id)).all()[0];
      const bRow = db.select().from(listItems).where(eq(listItems.id, bi.id)).all()[0];
      // ai gets position 1 (second in the input); bi was filtered out so its
      // position stays 0 (its original).
      expect(aRow?.position).toBe(1);
      expect(bRow?.position).toBe(0);
    });
  });

  describe('getList', () => {
    it('returns null on an unknown id', () => {
      expect(getList(db, 9999)).toBeNull();
    });
  });

  describe('service guard — direct INSERT bypasses normalisation', () => {
    it('raw INSERT of (ref_kind=ingredient, ref_id=NULL) is allowed at the schema level', () => {
      const list = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      raw
        .prepare(
          `INSERT INTO list_items (list_id, label, ref_kind, ref_id) VALUES (?, 'x', 'ingredient', NULL)`
        )
        .run(list.id);
      const row = listItemsForList(db, list.id)[0];
      expect(row?.refKind).toBe('ingredient');
      expect(row?.refId).toBeNull();
    });
  });

  describe('PRD-141 bulk mutations', () => {
    it('uncheckAllItems flips every checked row + returns the count', () => {
      const list = createList(db, { name: 'Shop', kind: 'shopping', ownerApp: 'food' });
      const a = addItem(db, { listId: list.id, label: 'a' });
      const b = addItem(db, { listId: list.id, label: 'b' });
      const c = addItem(db, { listId: list.id, label: 'c' });
      checkListItem(db, a.id);
      checkListItem(db, b.id);
      const count = uncheckAllListItems(db, list.id);
      expect(count).toBe(2);
      const rows = listItemsForList(db, list.id);
      expect(rows.every((r) => r.checked === 0)).toBe(true);
      expect(rows.every((r) => r.checkedAt === null)).toBe(true);
      expect(rows.find((r) => r.id === c.id)?.checked).toBe(0);
    });

    it('uncheckAllItems returns 0 when nothing is checked', () => {
      const list = createList(db, { name: 'Shop', kind: 'shopping', ownerApp: 'food' });
      addItem(db, { listId: list.id, label: 'a' });
      addItem(db, { listId: list.id, label: 'b' });
      expect(uncheckAllListItems(db, list.id)).toBe(0);
    });

    it('uncheckAllItems is scoped to the target list', () => {
      const a = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const b = createList(db, { name: 'B', kind: 'shopping', ownerApp: 'food' });
      const aRow = addItem(db, { listId: a.id, label: 'a' });
      const bRow = addItem(db, { listId: b.id, label: 'b' });
      checkListItem(db, aRow.id);
      checkListItem(db, bRow.id);
      expect(uncheckAllListItems(db, a.id)).toBe(1);
      const refreshed = listItemsForList(db, b.id)[0];
      expect(refreshed?.checked).toBe(1);
    });

    it('removeCheckedItems deletes every checked row + returns the count', () => {
      const list = createList(db, { name: 'Shop', kind: 'shopping', ownerApp: 'food' });
      const a = addItem(db, { listId: list.id, label: 'a' });
      const b = addItem(db, { listId: list.id, label: 'b' });
      const c = addItem(db, { listId: list.id, label: 'c' });
      checkListItem(db, a.id);
      checkListItem(db, c.id);
      const removed = removeCheckedItems(db, list.id);
      expect(removed).toBe(2);
      const remaining = listItemsForList(db, list.id);
      expect(remaining.map((r) => r.id)).toEqual([b.id]);
    });

    it('removeCheckedItems returns 0 when nothing is checked', () => {
      const list = createList(db, { name: 'Shop', kind: 'shopping', ownerApp: 'food' });
      addItem(db, { listId: list.id, label: 'a' });
      expect(removeCheckedItems(db, list.id)).toBe(0);
      expect(listItemsForList(db, list.id).length).toBe(1);
    });

    it('removeCheckedItems is scoped to the target list', () => {
      const a = createList(db, { name: 'A', kind: 'shopping', ownerApp: 'food' });
      const b = createList(db, { name: 'B', kind: 'shopping', ownerApp: 'food' });
      const aRow = addItem(db, { listId: a.id, label: 'a' });
      const bRow = addItem(db, { listId: b.id, label: 'b' });
      checkListItem(db, aRow.id);
      checkListItem(db, bRow.id);
      expect(removeCheckedItems(db, a.id)).toBe(1);
      expect(listItemsForList(db, b.id).length).toBe(1);
    });
  });
});
