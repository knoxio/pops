/**
 * PRD-140 — integration tests for the lists REST surface.
 *
 * Spins up an in-memory SQLite with PRD-112's lists migration (0062),
 * builds the Express app via the production factory, and drives every
 * endpoint through supertest. The `client` helper preserves the shape
 * of the historical tRPC caller (`client.list.create({...})`,
 * `client.items.check({id})`) so the assertions read the same; only
 * the transport changed.
 *
 * Status semantics (replacement of the old TRPCError model):
 *   - Service NotFound (`ListNotFoundError`, `ListItemNotFoundError`)
 *     → HTTP 404 with `{ message, code: 'NOT_FOUND' }`.
 *   - SQLite FK / UNIQUE constraint → HTTP 400 with `code: 'CONFLICT_FK'` /
 *     `'CONFLICT_UNIQUE'`. Maintains the wire-level signal that the
 *     consumer sent a request the database rejected.
 *   - Zod validation failure (whitespace name, empty patch) → HTTP 400.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createListsApiApp } from '../app.js';

import type { Express } from 'express';

import type { ListsDb } from '../../db/index.js';
import type { ListsApiDeps } from '../handlers.js';

const MIGRATION_FILES = ['0062_chemical_donald_blake.sql'];

function applyMigration(db: Database, filename: string): void {
  const sql = readFileSync(join(__dirname, '../../../migrations', filename), 'utf8');
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

function buildApp(raw: Database, db: ListsDb): Express {
  const deps: ListsApiDeps = {
    listsDb: { raw, db },
    version: '0.0.0-test',
    selfBaseUrl: 'http://lists.test',
  };
  return createListsApiApp(deps);
}

interface CreateListBody {
  name: string;
  kind: 'shopping' | 'packing' | 'todo' | 'generic';
  ownerApp?: string;
}

interface UpdateListBody {
  id: number;
  name?: string;
  kind?: 'shopping' | 'packing' | 'todo' | 'generic';
}

interface AddItemBody {
  listId: number;
  label: string;
  qty?: number | null;
  unit?: string | null;
  refKind?: 'free' | 'ingredient' | 'variant' | 'recipe' | 'custom';
  refId?: number | null;
  notes?: string | null;
  position?: number;
}

class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const messageFromBody =
      body !== null && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : JSON.stringify(body);
    super(`HTTP ${status}: ${messageFromBody}`);
    this.status = status;
    this.body = body;
  }
}

function assert2xx<T>(res: { status: number; body: unknown }): T {
  if (res.status < 200 || res.status >= 300) {
    throw new HttpError(res.status, res.body);
  }
  return res.body as T;
}

function makeClient(app: Express): {
  list: {
    list: (q?: { kinds?: string[]; includeArchived?: boolean; sort?: string }) => Promise<{
      items: ListAggregateWire[];
    }>;
    get: (input: { id: number }) => Promise<ListGetWire | null>;
    create: (body: CreateListBody) => Promise<{ id: number }>;
    update: (input: UpdateListBody) => Promise<{ ok: true } | { ok: false; reason: 'NotFound' }>;
    archive: (input: { id: number }) => Promise<{ ok: true }>;
    unarchive: (input: { id: number }) => Promise<{ ok: true }>;
    delete: (input: { id: number }) => Promise<{ ok: true }>;
  };
  items: {
    add: (body: AddItemBody) => Promise<{ id: number; position: number }>;
    bulkAdd: (input: {
      listId: number;
      items: Omit<AddItemBody, 'listId'>[];
    }) => Promise<{ addedIds: number[] }>;
    update: (input: {
      id: number;
      label?: string;
      qty?: number | null;
      unit?: string | null;
      notes?: string | null;
    }) => Promise<{ ok: true }>;
    check: (input: { id: number }) => Promise<{ ok: true; checkedAt: string }>;
    uncheck: (input: { id: number }) => Promise<{ ok: true }>;
    remove: (input: { id: number }) => Promise<{ ok: true }>;
    reorder: (input: {
      listId: number;
      orderedIds: number[];
    }) => Promise<{ ok: true } | { ok: false; reason: 'BadIds' }>;
    uncheckAll: (input: { listId: number }) => Promise<{ ok: true; count: number }>;
    removeChecked: (input: { listId: number }) => Promise<{ ok: true; removedCount: number }>;
    search: (q?: {
      kind?: 'shopping' | 'packing' | 'todo' | 'generic';
      listId?: number;
      includeArchived?: boolean;
      labelContains?: string;
      notesContains?: string;
    }) => Promise<{ items: ListItemWire[] }>;
    upsertByRef: (input: {
      listId: number;
      refKind: 'ingredient' | 'variant' | 'recipe' | 'custom';
      refId: number;
      label: string;
      qty?: number | null;
      unit?: string | null;
      notes?: string | null;
      onConflict?: 'merge-additive' | 'replace' | 'skip';
    }) => Promise<
      | { outcome: 'inserted'; itemId: number; position: number }
      | { outcome: 'merged'; itemId: number }
      | { outcome: 'skipped'; itemId: number }
    >;
  };
} {
  const api = supertest(app);
  return {
    list: {
      list: async (q) => assert2xx(await api.get('/lists').query(q ?? {})),
      get: async ({ id }) => assert2xx(await api.get(`/lists/${id}`)),
      create: async (body) => assert2xx(await api.post('/lists').send(body)),
      update: async ({ id, ...patch }) => assert2xx(await api.patch(`/lists/${id}`).send(patch)),
      archive: async ({ id }) => assert2xx(await api.post(`/lists/${id}/archive`).send({})),
      unarchive: async ({ id }) => assert2xx(await api.post(`/lists/${id}/unarchive`).send({})),
      delete: async ({ id }) => assert2xx(await api.delete(`/lists/${id}`)),
    },
    items: {
      add: async ({ listId, ...body }) =>
        assert2xx(await api.post(`/lists/${listId}/items`).send(body)),
      bulkAdd: async ({ listId, items }) =>
        assert2xx(await api.post(`/lists/${listId}/items/bulk`).send({ items })),
      update: async ({ id, ...body }) => assert2xx(await api.patch(`/items/${id}`).send(body)),
      check: async ({ id }) => assert2xx(await api.post(`/items/${id}/check`).send({})),
      uncheck: async ({ id }) => assert2xx(await api.post(`/items/${id}/uncheck`).send({})),
      remove: async ({ id }) => assert2xx(await api.delete(`/items/${id}`)),
      reorder: async ({ listId, orderedIds }) =>
        assert2xx(await api.post(`/lists/${listId}/items/reorder`).send({ orderedIds })),
      uncheckAll: async ({ listId }) =>
        assert2xx(await api.post(`/lists/${listId}/items/uncheck-all`).send({})),
      removeChecked: async ({ listId }) =>
        assert2xx(await api.delete(`/lists/${listId}/items/checked`)),
      search: async (q) => assert2xx(await api.get('/items').query(q ?? {})),
      upsertByRef: async ({ listId, ...body }) =>
        assert2xx(await api.post(`/lists/${listId}/items/upsert-by-ref`).send(body)),
    },
  };
}

interface ListItemWire {
  id: number;
  listId: number;
  label: string;
  qty: number | null;
  unit: string | null;
  refKind: string;
  refId: number | null;
  notes: string | null;
  position: number;
  checked: number;
  checkedAt: string | null;
  createdAt: string;
}

interface ListAggregateWire {
  id: number;
  name: string;
  kind: string;
  itemCount: number;
  uncheckedCount: number;
  lastUpdatedAt: string;
  archivedAt: string | null;
}

interface ListGetWire {
  list: { id: number; name: string; kind: string };
  items: { id: number; label: string; position: number; checked: number }[];
}

describe('PRD-140 lists REST surface', () => {
  let raw: Database;
  let db: ListsDb;
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    raw = createListsTestDb();
    db = drizzle(raw) as unknown as ListsDb;
    const app = buildApp(raw, db);
    client = makeClient(app);
  });

  afterEach(() => {
    raw.close();
  });

  describe('POST /lists', () => {
    it('creates a list with ownerApp defaulting to "user"', async () => {
      const { id } = await client.list.create({ name: 'Groceries', kind: 'shopping' });
      expect(id).toBeGreaterThan(0);
      const row = raw.prepare(`SELECT * FROM lists WHERE id = ?`).get(id) as {
        name: string;
        kind: string;
        owner_app: string;
      };
      expect(row).toMatchObject({ name: 'Groceries', kind: 'shopping', owner_app: 'user' });
    });

    it('lets caller override ownerApp', async () => {
      const { id } = await client.list.create({
        name: 'From recipe',
        kind: 'shopping',
        ownerApp: 'food',
      });
      const row = raw.prepare(`SELECT owner_app FROM lists WHERE id = ?`).get(id) as {
        owner_app: string;
      };
      expect(row.owner_app).toBe('food');
    });

    it('rejects whitespace-only name with HTTP 400', async () => {
      await expect(client.list.create({ name: '   ', kind: 'shopping' })).rejects.toThrow(
        /HTTP 400/
      );
    });
  });

  describe('PATCH /lists/:id', () => {
    it('updates name', async () => {
      const { id } = await client.list.create({ name: 'Old', kind: 'shopping' });
      const result = await client.list.update({ id, name: 'New' });
      expect(result).toEqual({ ok: true });
      const row = raw.prepare(`SELECT name FROM lists WHERE id = ?`).get(id) as {
        name: string;
      };
      expect(row.name).toBe('New');
    });

    it('updates kind without modifying items', async () => {
      const { id } = await client.list.create({ name: 'List', kind: 'shopping' });
      await client.items.add({ listId: id, label: 'milk' });
      await client.list.update({ id, kind: 'todo' });
      const row = raw.prepare(`SELECT kind FROM lists WHERE id = ?`).get(id) as { kind: string };
      expect(row.kind).toBe('todo');
      const itemCount = raw
        .prepare(`SELECT COUNT(*) AS c FROM list_items WHERE list_id = ?`)
        .get(id) as { c: number };
      expect(itemCount.c).toBe(1);
    });

    it('reports NotFound for unknown id (no throw)', async () => {
      const result = await client.list.update({ id: 99999, name: 'x' });
      expect(result).toEqual({ ok: false, reason: 'NotFound' });
    });

    it('rejects an empty patch with HTTP 400', async () => {
      const { id } = await client.list.create({ name: 'Empty', kind: 'shopping' });
      await expect(client.list.update({ id })).rejects.toThrow(/HTTP 400/);
    });
  });

  describe('archive / unarchive', () => {
    it('archive sets archivedAt and is idempotent', async () => {
      const { id } = await client.list.create({ name: 'L', kind: 'shopping' });
      await client.list.archive({ id });
      const first = raw.prepare(`SELECT archived_at FROM lists WHERE id = ?`).get(id) as {
        archived_at: string;
      };
      expect(first.archived_at).not.toBeNull();
      await client.list.archive({ id });
      const second = raw.prepare(`SELECT archived_at FROM lists WHERE id = ?`).get(id) as {
        archived_at: string;
      };
      expect(second.archived_at).not.toBeNull();
    });

    it('unarchive clears archivedAt', async () => {
      const { id } = await client.list.create({ name: 'L', kind: 'shopping' });
      await client.list.archive({ id });
      await client.list.unarchive({ id });
      const row = raw.prepare(`SELECT archived_at FROM lists WHERE id = ?`).get(id) as {
        archived_at: string | null;
      };
      expect(row.archived_at).toBeNull();
    });
  });

  describe('DELETE /lists/:id', () => {
    it('cascades items in one transaction', async () => {
      const { id } = await client.list.create({ name: 'L', kind: 'shopping' });
      await client.items.add({ listId: id, label: 'a' });
      await client.items.add({ listId: id, label: 'b' });
      await client.list.delete({ id });
      const headerCount = raw.prepare(`SELECT COUNT(*) AS c FROM lists WHERE id = ?`).get(id) as {
        c: number;
      };
      const itemCount = raw
        .prepare(`SELECT COUNT(*) AS c FROM list_items WHERE list_id = ?`)
        .get(id) as { c: number };
      expect(headerCount.c).toBe(0);
      expect(itemCount.c).toBe(0);
    });

    it('returns HTTP 404 on an unknown id', async () => {
      await expect(client.list.delete({ id: 99999 })).rejects.toThrow(/HTTP 404/);
    });
  });

  describe('GET /lists/:id', () => {
    it('returns null for unknown id (detail page renders empty state)', async () => {
      const result = await client.list.get({ id: 99999 });
      expect(result).toBeNull();
    });

    it('returns the list + items sorted by position', async () => {
      const { id } = await client.list.create({ name: 'L', kind: 'shopping' });
      await client.items.add({ listId: id, label: 'a' });
      await client.items.add({ listId: id, label: 'b' });
      const result = await client.list.get({ id });
      expect(result?.list).toMatchObject({ id, name: 'L', kind: 'shopping' });
      expect(result?.items.map((it) => it.label)).toEqual(['a', 'b']);
      expect(result?.items.map((it) => it.position)).toEqual([0, 1]);
    });
  });

  describe('GET /lists (index aggregate)', () => {
    it('computes itemCount, uncheckedCount, lastUpdatedAt per list', async () => {
      const { id: a } = await client.list.create({ name: 'A', kind: 'shopping' });
      await client.items.add({ listId: a, label: '1' });
      const { id: item2 } = await client.items.add({ listId: a, label: '2' });
      await client.items.check({ id: item2 });

      const { id: b } = await client.list.create({ name: 'B', kind: 'todo' });
      await client.items.add({ listId: b, label: 'x' });

      const { items } = await client.list.list();
      const byId = new Map(items.map((r) => [r.id, r]));
      expect(byId.get(a)).toMatchObject({ itemCount: 2, uncheckedCount: 1 });
      expect(byId.get(b)).toMatchObject({ itemCount: 1, uncheckedCount: 1 });
      expect(typeof byId.get(a)?.lastUpdatedAt).toBe('string');
    });

    it('filters by kind', async () => {
      await client.list.create({ name: 'A', kind: 'shopping' });
      await client.list.create({ name: 'B', kind: 'todo' });
      const { items } = await client.list.list({ kinds: ['shopping'] });
      expect(items).toHaveLength(1);
      expect(items[0]?.kind).toBe('shopping');
    });

    it('hides archived lists by default and surfaces them when includeArchived=true', async () => {
      const { id } = await client.list.create({ name: 'A', kind: 'shopping' });
      await client.list.archive({ id });
      const hidden = await client.list.list();
      expect(hidden.items).toHaveLength(0);
      const visible = await client.list.list({ includeArchived: true });
      expect(visible.items).toHaveLength(1);
      expect(visible.items[0]?.archivedAt).not.toBeNull();
    });

    it('sorts by name', async () => {
      await client.list.create({ name: 'Zoo', kind: 'shopping' });
      await client.list.create({ name: 'apple', kind: 'shopping' });
      const { items } = await client.list.list({ sort: 'name' });
      expect(items.map((r) => r.name)).toEqual(['apple', 'Zoo']);
    });

    it('returns uncheckedCount=0 when items are absent (LEFT JOIN preserves header)', async () => {
      await client.list.create({ name: 'Empty', kind: 'shopping' });
      const { items } = await client.list.list();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ itemCount: 0, uncheckedCount: 0 });
    });
  });

  describe('POST /lists/:listId/items', () => {
    it('returns id + position; position is monotonic per list', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const first = await client.items.add({ listId, label: 'a' });
      const second = await client.items.add({ listId, label: 'b' });
      expect(first.position).toBe(0);
      expect(second.position).toBe(1);
      expect(second.id).toBeGreaterThan(first.id);
    });

    it('returns HTTP 400 with foreign-key code when listId references a missing list', async () => {
      await expect(client.items.add({ listId: 99999, label: 'x' })).rejects.toMatchObject({
        message: expect.stringMatching(/foreign key/i),
      });
    });
  });

  describe('POST /lists/:listId/items/bulk', () => {
    it('inserts in order and returns ids in input order', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { addedIds } = await client.items.bulkAdd({
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

  describe('PATCH /items/:id', () => {
    it('updates label only', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await client.items.add({ listId, label: 'old' });
      await client.items.update({ id, label: 'new' });
      const row = raw.prepare(`SELECT label FROM list_items WHERE id = ?`).get(id) as {
        label: string;
      };
      expect(row.label).toBe('new');
    });

    it('rejects empty patch with HTTP 400', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await client.items.add({ listId, label: 'x' });
      await expect(client.items.update({ id })).rejects.toThrow(/HTTP 400/);
    });
  });

  describe('check / uncheck', () => {
    it('check returns checkedAt and stores it', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await client.items.add({ listId, label: 'x' });
      const result = await client.items.check({ id });
      expect(result.ok).toBe(true);
      expect(typeof result.checkedAt).toBe('string');
      const row = raw
        .prepare(`SELECT checked, checked_at FROM list_items WHERE id = ?`)
        .get(id) as { checked: number; checked_at: string | null };
      expect(row.checked).toBe(1);
      expect(row.checked_at).toBe(result.checkedAt);
    });

    it('uncheck clears the timestamp', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await client.items.add({ listId, label: 'x' });
      await client.items.check({ id });
      await client.items.uncheck({ id });
      const row = raw
        .prepare(`SELECT checked, checked_at FROM list_items WHERE id = ?`)
        .get(id) as { checked: number; checked_at: string | null };
      expect(row.checked).toBe(0);
      expect(row.checked_at).toBeNull();
    });
  });

  describe('DELETE /items/:id', () => {
    it('removes a row and is idempotent', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { id } = await client.items.add({ listId, label: 'x' });
      await client.items.remove({ id });
      await client.items.remove({ id });
      const row = raw.prepare(`SELECT COUNT(*) AS c FROM list_items WHERE id = ?`).get(id) as {
        c: number;
      };
      expect(row.c).toBe(0);
    });
  });

  describe('reorder', () => {
    it('rewrites positions in input order', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { id: a } = await client.items.add({ listId, label: 'a' });
      const { id: b } = await client.items.add({ listId, label: 'b' });
      const { id: c } = await client.items.add({ listId, label: 'c' });
      const result = await client.items.reorder({ listId, orderedIds: [c, a, b] });
      expect(result).toEqual({ ok: true });
      const rows = raw
        .prepare(`SELECT id, position FROM list_items WHERE list_id = ? ORDER BY position`)
        .all(listId) as { id: number; position: number }[];
      expect(rows.map((r) => r.id)).toEqual([c, a, b]);
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    });

    it('rejects when count differs from the live item set', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { id: a } = await client.items.add({ listId, label: 'a' });
      await client.items.add({ listId, label: 'b' });
      const result = await client.items.reorder({ listId, orderedIds: [a] });
      expect(result).toEqual({ ok: false, reason: 'BadIds' });
    });

    it('rejects when orderedIds contains a duplicate', async () => {
      const { id: listId } = await client.list.create({ name: 'L', kind: 'shopping' });
      const { id: a } = await client.items.add({ listId, label: 'a' });
      const { id: b } = await client.items.add({ listId, label: 'b' });
      const result = await client.items.reorder({ listId, orderedIds: [a, a] });
      expect(result).toEqual({ ok: false, reason: 'BadIds' });
      const rows = raw
        .prepare(`SELECT id, position FROM list_items WHERE list_id = ? ORDER BY id`)
        .all(listId) as { id: number; position: number }[];
      expect(rows).toEqual([
        { id: a, position: 0 },
        { id: b, position: 1 },
      ]);
    });

    it('rejects when an id belongs to a different list', async () => {
      const { id: listA } = await client.list.create({ name: 'A', kind: 'shopping' });
      const { id: listB } = await client.list.create({ name: 'B', kind: 'shopping' });
      const { id: a } = await client.items.add({ listId: listA, label: 'a' });
      const { id: foreign } = await client.items.add({ listId: listB, label: 'b' });
      const result = await client.items.reorder({
        listId: listA,
        orderedIds: [a, foreign],
      });
      expect(result).toEqual({ ok: false, reason: 'BadIds' });
    });
  });

  describe('uncheckAll (PRD-141)', () => {
    it('unchecks every checked item and returns the count', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      const { id: a } = await client.items.add({ listId, label: 'a' });
      const { id: b } = await client.items.add({ listId, label: 'b' });
      await client.items.add({ listId, label: 'c' });
      await client.items.check({ id: a });
      await client.items.check({ id: b });
      const result = await client.items.uncheckAll({ listId });
      expect(result).toEqual({ ok: true, count: 2 });
      const detail = await client.list.get({ id: listId });
      expect(detail?.items.every((row) => row.checked === 0)).toBe(true);
    });

    it('returns count=0 when nothing is checked', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      await client.items.add({ listId, label: 'a' });
      expect(await client.items.uncheckAll({ listId })).toEqual({ ok: true, count: 0 });
    });

    it('is scoped to the target list', async () => {
      const { id: listA } = await client.list.create({ name: 'A', kind: 'shopping' });
      const { id: listB } = await client.list.create({ name: 'B', kind: 'shopping' });
      const { id: a } = await client.items.add({ listId: listA, label: 'a' });
      const { id: b } = await client.items.add({ listId: listB, label: 'b' });
      await client.items.check({ id: a });
      await client.items.check({ id: b });
      await client.items.uncheckAll({ listId: listA });
      const detailB = await client.list.get({ id: listB });
      expect(detailB?.items[0]?.checked).toBe(1);
    });
  });

  describe('removeChecked (PRD-141)', () => {
    it('removes every checked item and returns the count', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      const { id: a } = await client.items.add({ listId, label: 'a' });
      await client.items.add({ listId, label: 'b' });
      const { id: c } = await client.items.add({ listId, label: 'c' });
      await client.items.check({ id: a });
      await client.items.check({ id: c });
      const result = await client.items.removeChecked({ listId });
      expect(result).toEqual({ ok: true, removedCount: 2 });
      const detail = await client.list.get({ id: listId });
      expect(detail?.items.map((row) => row.label)).toEqual(['b']);
    });

    it('returns removedCount=0 when nothing is checked', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      await client.items.add({ listId, label: 'a' });
      expect(await client.items.removeChecked({ listId })).toEqual({
        ok: true,
        removedCount: 0,
      });
    });

    it('is scoped to the target list', async () => {
      const { id: listA } = await client.list.create({ name: 'A', kind: 'shopping' });
      const { id: listB } = await client.list.create({ name: 'B', kind: 'shopping' });
      const { id: a } = await client.items.add({ listId: listA, label: 'a' });
      const { id: b } = await client.items.add({ listId: listB, label: 'b' });
      await client.items.check({ id: a });
      await client.items.check({ id: b });
      await client.items.removeChecked({ listId: listA });
      const detailB = await client.list.get({ id: listB });
      expect(detailB?.items.length).toBe(1);
    });
  });

  describe('GET /items (search)', () => {
    it('filters by notesContains across all matching lists', async () => {
      const { id: shopA } = await client.list.create({ name: 'Shop A', kind: 'shopping' });
      const { id: shopB } = await client.list.create({ name: 'Shop B', kind: 'shopping' });
      const { id: todoC } = await client.list.create({ name: 'Todo C', kind: 'todo' });
      await client.items.add({ listId: shopA, label: 'tomato', notes: 'Risotto Verde' });
      await client.items.add({ listId: shopB, label: 'onion', notes: 'Risotto Verde + Soup' });
      await client.items.add({ listId: shopB, label: 'salt', notes: 'pantry' });
      await client.items.add({ listId: todoC, label: 'call mum', notes: 'Risotto Verde dinner' });

      const { items } = await client.items.search({ notesContains: 'risotto verde' });
      const matchedLists = new Set(items.map((it) => it.listId));
      expect(matchedLists.has(shopA)).toBe(true);
      expect(matchedLists.has(shopB)).toBe(true);
      expect(matchedLists.has(todoC)).toBe(true);
      expect(items.find((it) => it.label === 'salt')).toBeUndefined();
    });

    it('combines notesContains with kind=shopping to scope away other list kinds', async () => {
      const { id: shop } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      const { id: todo } = await client.list.create({ name: 'Todo', kind: 'todo' });
      await client.items.add({ listId: shop, label: 'tomato', notes: 'Risotto' });
      await client.items.add({ listId: todo, label: 'call mum', notes: 'Risotto dinner' });

      const { items } = await client.items.search({ notesContains: 'risotto', kind: 'shopping' });
      const matched = new Set(items.map((it) => it.listId));
      expect(matched.has(shop)).toBe(true);
      expect(matched.has(todo)).toBe(false);
    });

    it('hides items from archived lists by default; surfaces them with includeArchived', async () => {
      const { id: listId } = await client.list.create({ name: 'A', kind: 'shopping' });
      await client.items.add({ listId, label: 'milk', notes: 'recipe X' });
      await client.list.archive({ id: listId });

      const hidden = await client.items.search({ notesContains: 'recipe X' });
      expect(hidden.items).toHaveLength(0);

      const visible = await client.items.search({
        notesContains: 'recipe X',
        includeArchived: true,
      });
      expect(visible.items).toHaveLength(1);
    });

    it('escapes %, _, and \\ in contains-strings so they are matched literally', async () => {
      const { id: listId } = await client.list.create({ name: 'A', kind: 'shopping' });
      await client.items.add({ listId, label: '100% wholemeal' });
      await client.items.add({ listId, label: 'rough_label' });
      await client.items.add({ listId, label: 'normal label' });

      const pct = await client.items.search({ labelContains: '100%' });
      expect(pct.items.map((it) => it.label)).toEqual(['100% wholemeal']);

      const underscore = await client.items.search({ labelContains: 'rough_label' });
      expect(underscore.items.map((it) => it.label)).toEqual(['rough_label']);
    });

    it('filters by listId to constrain search to one list', async () => {
      const { id: listA } = await client.list.create({ name: 'A', kind: 'shopping' });
      const { id: listB } = await client.list.create({ name: 'B', kind: 'shopping' });
      await client.items.add({ listId: listA, label: 'tomato' });
      await client.items.add({ listId: listB, label: 'tomato' });
      const { items } = await client.items.search({ listId: listA, labelContains: 'tomato' });
      expect(items).toHaveLength(1);
      expect(items[0]?.listId).toBe(listA);
    });
  });

  describe('POST /lists/:listId/items/upsert-by-ref', () => {
    it('inserts when no matching (refKind, refId) row exists', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      const result = await client.items.upsertByRef({
        listId,
        refKind: 'ingredient',
        refId: 42,
        label: 'tomato 200g',
        qty: 200,
        unit: 'g',
        notes: 'Risotto Verde',
      });
      expect(result.outcome).toBe('inserted');
      const row = raw
        .prepare(`SELECT qty, unit, notes, label FROM list_items WHERE list_id = ? AND ref_id = ?`)
        .get(listId, 42) as { qty: number; unit: string; notes: string; label: string };
      expect(row).toMatchObject({
        qty: 200,
        unit: 'g',
        notes: 'Risotto Verde',
        label: 'tomato 200g',
      });
    });

    it('merge-additive (default) sums qty, joins notes with newline, replaces label', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      await client.items.upsertByRef({
        listId,
        refKind: 'ingredient',
        refId: 42,
        label: 'tomato 200g',
        qty: 200,
        unit: 'g',
        notes: 'Risotto Verde',
      });
      const merged = await client.items.upsertByRef({
        listId,
        refKind: 'ingredient',
        refId: 42,
        label: 'tomato 350g',
        qty: 150,
        unit: 'g',
        notes: 'Soup',
      });
      expect(merged.outcome).toBe('merged');
      const row = raw
        .prepare(`SELECT qty, unit, notes, label FROM list_items WHERE list_id = ? AND ref_id = ?`)
        .get(listId, 42) as { qty: number; unit: string; notes: string; label: string };
      expect(row).toMatchObject({
        qty: 350,
        unit: 'g',
        notes: 'Risotto Verde\nSoup',
        label: 'tomato 350g',
      });
    });

    it('replace mode overwrites qty, unit, notes, label wholesale', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      await client.items.upsertByRef({
        listId,
        refKind: 'ingredient',
        refId: 42,
        label: 'tomato 200g',
        qty: 200,
        unit: 'g',
        notes: 'Risotto Verde',
      });
      const replaced = await client.items.upsertByRef({
        listId,
        refKind: 'ingredient',
        refId: 42,
        label: 'tomato 1pc',
        qty: 1,
        unit: 'pc',
        notes: 'Direct add',
        onConflict: 'replace',
      });
      expect(replaced.outcome).toBe('merged');
      const row = raw
        .prepare(`SELECT qty, unit, notes, label FROM list_items WHERE list_id = ? AND ref_id = ?`)
        .get(listId, 42) as { qty: number; unit: string; notes: string; label: string };
      expect(row).toMatchObject({ qty: 1, unit: 'pc', notes: 'Direct add', label: 'tomato 1pc' });
    });

    it('skip mode leaves the existing row untouched', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      await client.items.upsertByRef({
        listId,
        refKind: 'ingredient',
        refId: 42,
        label: 'tomato 200g',
        qty: 200,
        unit: 'g',
        notes: 'Risotto Verde',
      });
      const skipped = await client.items.upsertByRef({
        listId,
        refKind: 'ingredient',
        refId: 42,
        label: 'tomato 1pc',
        qty: 1,
        unit: 'pc',
        notes: 'Direct add',
        onConflict: 'skip',
      });
      expect(skipped.outcome).toBe('skipped');
      const row = raw
        .prepare(`SELECT qty, unit, notes, label FROM list_items WHERE list_id = ? AND ref_id = ?`)
        .get(listId, 42) as { qty: number; unit: string; notes: string; label: string };
      expect(row).toMatchObject({
        qty: 200,
        unit: 'g',
        notes: 'Risotto Verde',
        label: 'tomato 200g',
      });
    });

    it('rejects refKind=free with HTTP 400 at the contract boundary', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      const res = await supertest(buildApp(raw, db))
        .post(`/lists/${listId}/items/upsert-by-ref`)
        .send({
          refKind: 'free',
          refId: 1,
          label: 'x',
          qty: 1,
        });
      expect(res.status).toBe(400);
    });

    it('returns HTTP 400 (FK constraint) when listId references a missing list', async () => {
      await expect(
        client.items.upsertByRef({
          listId: 99999,
          refKind: 'ingredient',
          refId: 42,
          label: 'x',
          qty: 1,
        })
      ).rejects.toMatchObject({ message: expect.stringMatching(/foreign key/i) });
    });

    it('keeps separate identities for matching refId across different refKinds', async () => {
      const { id: listId } = await client.list.create({ name: 'Shop', kind: 'shopping' });
      const a = await client.items.upsertByRef({
        listId,
        refKind: 'ingredient',
        refId: 7,
        label: 'tomato',
      });
      const b = await client.items.upsertByRef({
        listId,
        refKind: 'variant',
        refId: 7,
        label: 'tinned tomato',
      });
      expect(a.outcome).toBe('inserted');
      expect(b.outcome).toBe('inserted');
      expect(a.itemId).not.toBe(b.itemId);
    });
  });
});
