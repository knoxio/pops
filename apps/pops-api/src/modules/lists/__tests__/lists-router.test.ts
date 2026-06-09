/**
 * PRD-140 — integration tests for `lists.*`.
 *
 * Spins up an in-memory SQLite with PRD-112's lists migration (0062), wires
 * it into `getDb()`, and drives every procedure through `appRouter`'s
 * caller. The pattern matches the food conversions router suite.
 *
 * Coverage (per PRD-140 §AC and §Edge Cases):
 *   - `list.list` aggregate: itemCount, uncheckedCount, lastUpdatedAt;
 *     kind filter, includeArchived toggle, sort modes.
 *   - `list.get` returns `null` for unknown id (page renders empty state).
 *   - `list.create` defaults ownerApp='user'; trim + non-empty enforcement.
 *   - `list.update` patches name + kind; reports `{ ok:false, reason:'NotFound' }`.
 *   - `list.archive` / `list.unarchive` idempotency.
 *   - `list.delete` cascades items and 404s on unknown id.
 *   - `items.add` returns id + position; `bulkAdd` echoes addedIds in order.
 *   - `items.update` patches non-empty fields; rejects empty patch via Zod.
 *   - `items.check` returns `checkedAt` ISO; `uncheck` clears it.
 *   - `items.remove` idempotent.
 *   - `items.reorder` rejects count mismatch + cross-list ids.
 *   - FK violation (item added to deleted list) → CONFLICT.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';

const MIGRATION_FILES = ['0062_chemical_donald_blake.sql'];

function applyMigration(db: Database, filename: string): void {
  const sql = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

function createListsTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATION_FILES) applyMigration(db, name);
  return db;
}

describe('PRD-140 lists router', () => {
  let raw: Database;

  beforeEach(() => {
    raw = createListsTestDb();
    setDb(raw);
  });

  afterEach(() => {
    closeDb();
    raw.close();
  });

  describe('list.create', () => {
    it('creates a list with ownerApp defaulting to "user"', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'Groceries', kind: 'shopping' });
      expect(id).toBeGreaterThan(0);
      const row = raw.prepare(`SELECT * FROM lists WHERE id = ?`).get(id) as {
        name: string;
        kind: string;
        owner_app: string;
      };
      expect(row).toMatchObject({ name: 'Groceries', kind: 'shopping', owner_app: 'user' });
    });

    it('lets caller override ownerApp', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({
        name: 'From recipe',
        kind: 'shopping',
        ownerApp: 'food',
      });
      const row = raw.prepare(`SELECT owner_app FROM lists WHERE id = ?`).get(id) as {
        owner_app: string;
      };
      expect(row.owner_app).toBe('food');
    });

    it('rejects whitespace-only name at the Zod boundary', async () => {
      const caller = createCaller();
      await expect(caller.lists.list.create({ name: '   ', kind: 'shopping' })).rejects.toThrow();
    });
  });

  describe('list.update', () => {
    it('updates name', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'Old', kind: 'shopping' });
      const result = await caller.lists.list.update({ id, name: 'New' });
      expect(result).toEqual({ ok: true });
      const row = raw.prepare(`SELECT name FROM lists WHERE id = ?`).get(id) as { name: string };
      expect(row.name).toBe('New');
    });

    it('updates kind without modifying items', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'List', kind: 'shopping' });
      await caller.lists.items.add({ listId: id, label: 'milk' });
      await caller.lists.list.update({ id, kind: 'todo' });
      const row = raw.prepare(`SELECT kind FROM lists WHERE id = ?`).get(id) as { kind: string };
      expect(row.kind).toBe('todo');
      const itemCount = raw
        .prepare(`SELECT COUNT(*) AS c FROM list_items WHERE list_id = ?`)
        .get(id) as { c: number };
      expect(itemCount.c).toBe(1);
    });

    it('reports NotFound for unknown id (no throw)', async () => {
      const caller = createCaller();
      const result = await caller.lists.list.update({ id: 99999, name: 'x' });
      expect(result).toEqual({ ok: false, reason: 'NotFound' });
    });

    it('rejects an empty patch at the Zod boundary', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'Empty', kind: 'shopping' });
      await expect(caller.lists.list.update({ id })).rejects.toThrow();
    });
  });

  describe('list.archive / list.unarchive', () => {
    it('archive sets archivedAt and is idempotent', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      await caller.lists.list.archive({ id });
      const first = raw.prepare(`SELECT archived_at FROM lists WHERE id = ?`).get(id) as {
        archived_at: string;
      };
      expect(first.archived_at).not.toBeNull();
      // Idempotent — calling again does NOT throw and keeps the row archived.
      await caller.lists.list.archive({ id });
      const second = raw.prepare(`SELECT archived_at FROM lists WHERE id = ?`).get(id) as {
        archived_at: string;
      };
      expect(second.archived_at).not.toBeNull();
    });

    it('unarchive clears archivedAt', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      await caller.lists.list.archive({ id });
      await caller.lists.list.unarchive({ id });
      const row = raw.prepare(`SELECT archived_at FROM lists WHERE id = ?`).get(id) as {
        archived_at: string | null;
      };
      expect(row.archived_at).toBeNull();
    });
  });

  describe('list.delete', () => {
    it('cascades items in one transaction', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      await caller.lists.items.add({ listId: id, label: 'a' });
      await caller.lists.items.add({ listId: id, label: 'b' });
      await caller.lists.list.delete({ id });
      const headerCount = raw.prepare(`SELECT COUNT(*) AS c FROM lists WHERE id = ?`).get(id) as {
        c: number;
      };
      const itemCount = raw
        .prepare(`SELECT COUNT(*) AS c FROM list_items WHERE list_id = ?`)
        .get(id) as { c: number };
      expect(headerCount.c).toBe(0);
      expect(itemCount.c).toBe(0);
    });

    it('throws NOT_FOUND on an unknown id', async () => {
      const caller = createCaller();
      await expect(caller.lists.list.delete({ id: 99999 })).rejects.toThrow(/not found/i);
    });
  });

  describe('list.get', () => {
    it('returns null for unknown id (detail page renders empty state)', async () => {
      const caller = createCaller();
      const result = await caller.lists.list.get({ id: 99999 });
      expect(result).toBeNull();
    });

    it('returns the list + items sorted by position', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      await caller.lists.items.add({ listId: id, label: 'a' });
      await caller.lists.items.add({ listId: id, label: 'b' });
      const result = await caller.lists.list.get({ id });
      expect(result?.list).toMatchObject({ id, name: 'L', kind: 'shopping' });
      expect(result?.items.map((it) => it.label)).toEqual(['a', 'b']);
      expect(result?.items.map((it) => it.position)).toEqual([0, 1]);
    });
  });

  describe('list.list (index aggregate)', () => {
    it('computes itemCount, uncheckedCount, lastUpdatedAt per list', async () => {
      const caller = createCaller();
      const { id: a } = await caller.lists.list.create({ name: 'A', kind: 'shopping' });
      await caller.lists.items.add({ listId: a, label: '1' });
      const { id: item2 } = await caller.lists.items.add({ listId: a, label: '2' });
      await caller.lists.items.check({ id: item2 });

      const { id: b } = await caller.lists.list.create({ name: 'B', kind: 'todo' });
      await caller.lists.items.add({ listId: b, label: 'x' });

      const { items } = await caller.lists.list.list();
      const byId = new Map(items.map((r) => [r.id, r]));
      expect(byId.get(a)).toMatchObject({ itemCount: 2, uncheckedCount: 1 });
      expect(byId.get(b)).toMatchObject({ itemCount: 1, uncheckedCount: 1 });
      expect(typeof byId.get(a)?.lastUpdatedAt).toBe('string');
    });

    it('filters by kind', async () => {
      const caller = createCaller();
      await caller.lists.list.create({ name: 'A', kind: 'shopping' });
      await caller.lists.list.create({ name: 'B', kind: 'todo' });
      const { items } = await caller.lists.list.list({ kinds: ['shopping'] });
      expect(items).toHaveLength(1);
      expect(items[0]?.kind).toBe('shopping');
    });

    it('hides archived lists by default and surfaces them when includeArchived=true', async () => {
      const caller = createCaller();
      const { id } = await caller.lists.list.create({ name: 'A', kind: 'shopping' });
      await caller.lists.list.archive({ id });
      const hidden = await caller.lists.list.list();
      expect(hidden.items).toHaveLength(0);
      const visible = await caller.lists.list.list({ includeArchived: true });
      expect(visible.items).toHaveLength(1);
      expect(visible.items[0]?.archivedAt).not.toBeNull();
    });

    it('sorts by name', async () => {
      const caller = createCaller();
      await caller.lists.list.create({ name: 'Zoo', kind: 'shopping' });
      await caller.lists.list.create({ name: 'apple', kind: 'shopping' });
      const { items } = await caller.lists.list.list({ sort: 'name' });
      // NOCASE collation puts 'apple' before 'Zoo'.
      expect(items.map((r) => r.name)).toEqual(['apple', 'Zoo']);
    });

    it('returns uncheckedCount=0 when items are absent (LEFT JOIN preserves header)', async () => {
      const caller = createCaller();
      await caller.lists.list.create({ name: 'Empty', kind: 'shopping' });
      const { items } = await caller.lists.list.list();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ itemCount: 0, uncheckedCount: 0 });
    });
  });

  describe('items.add', () => {
    it('returns id + position; position is monotonic per list', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const first = await caller.lists.items.add({ listId, label: 'a' });
      const second = await caller.lists.items.add({ listId, label: 'b' });
      expect(first.position).toBe(0);
      expect(second.position).toBe(1);
      expect(second.id).toBeGreaterThan(first.id);
    });

    it('returns CONFLICT when listId references a missing list', async () => {
      const caller = createCaller();
      await expect(caller.lists.items.add({ listId: 99999, label: 'x' })).rejects.toMatchObject({
        message: expect.stringMatching(/foreign key/i),
      });
    });
  });

  describe('items.bulkAdd', () => {
    it('inserts in order and returns ids in input order', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const { addedIds } = await caller.lists.items.bulkAdd({
        listId,
        items: [{ label: 'first' }, { label: 'second' }, { label: 'third' }],
      });
      expect(addedIds).toHaveLength(3);
      const rows = raw
        .prepare(`SELECT label, position FROM list_items WHERE list_id = ? ORDER BY position`)
        .all(listId) as { label: string; position: number }[];
      expect(rows.map((r) => r.label)).toEqual(['first', 'second', 'third']);
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    });
  });

  describe('items.update', () => {
    it('updates label only', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await caller.lists.items.add({ listId, label: 'old' });
      await caller.lists.items.update({ id, label: 'new' });
      const row = raw.prepare(`SELECT label FROM list_items WHERE id = ?`).get(id) as {
        label: string;
      };
      expect(row.label).toBe('new');
    });

    it('rejects empty patch at Zod boundary', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await caller.lists.items.add({ listId, label: 'x' });
      await expect(caller.lists.items.update({ id })).rejects.toThrow();
    });
  });

  describe('items.check / items.uncheck', () => {
    it('check returns checkedAt and stores it', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await caller.lists.items.add({ listId, label: 'x' });
      const result = await caller.lists.items.check({ id });
      expect(result.ok).toBe(true);
      expect(typeof result.checkedAt).toBe('string');
      const row = raw
        .prepare(`SELECT checked, checked_at FROM list_items WHERE id = ?`)
        .get(id) as { checked: number; checked_at: string | null };
      expect(row.checked).toBe(1);
      expect(row.checked_at).toBe(result.checkedAt);
    });

    it('uncheck clears the timestamp', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await caller.lists.items.add({ listId, label: 'x' });
      await caller.lists.items.check({ id });
      await caller.lists.items.uncheck({ id });
      const row = raw
        .prepare(`SELECT checked, checked_at FROM list_items WHERE id = ?`)
        .get(id) as { checked: number; checked_at: string | null };
      expect(row.checked).toBe(0);
      expect(row.checked_at).toBeNull();
    });
  });

  describe('items.remove', () => {
    it('removes a row and is idempotent', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await caller.lists.items.add({ listId, label: 'x' });
      await caller.lists.items.remove({ id });
      await caller.lists.items.remove({ id }); // idempotent
      const row = raw.prepare(`SELECT COUNT(*) AS c FROM list_items WHERE id = ?`).get(id) as {
        c: number;
      };
      expect(row.c).toBe(0);
    });
  });

  describe('items.reorder', () => {
    it('rewrites positions in input order', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const { id: a } = await caller.lists.items.add({ listId, label: 'a' });
      const { id: b } = await caller.lists.items.add({ listId, label: 'b' });
      const { id: c } = await caller.lists.items.add({ listId, label: 'c' });
      const result = await caller.lists.items.reorder({ listId, orderedIds: [c, a, b] });
      expect(result).toEqual({ ok: true });
      const rows = raw
        .prepare(`SELECT id, position FROM list_items WHERE list_id = ? ORDER BY position`)
        .all(listId) as { id: number; position: number }[];
      expect(rows.map((r) => r.id)).toEqual([c, a, b]);
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    });

    it('rejects when count differs from the live item set', async () => {
      const caller = createCaller();
      const { id: listId } = await caller.lists.list.create({ name: 'L', kind: 'shopping' });
      const { id: a } = await caller.lists.items.add({ listId, label: 'a' });
      await caller.lists.items.add({ listId, label: 'b' });
      const result = await caller.lists.items.reorder({ listId, orderedIds: [a] });
      expect(result).toEqual({ ok: false, reason: 'BadIds' });
    });

    it('rejects when an id belongs to a different list', async () => {
      const caller = createCaller();
      const { id: listA } = await caller.lists.list.create({ name: 'A', kind: 'shopping' });
      const { id: listB } = await caller.lists.list.create({ name: 'B', kind: 'shopping' });
      const { id: a } = await caller.lists.items.add({ listId: listA, label: 'a' });
      const { id: foreign } = await caller.lists.items.add({ listId: listB, label: 'b' });
      const result = await caller.lists.items.reorder({
        listId: listA,
        orderedIds: [a, foreign],
      });
      expect(result).toEqual({ ok: false, reason: 'BadIds' });
    });
  });
});
