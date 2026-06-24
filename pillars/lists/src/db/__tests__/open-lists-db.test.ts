/**
 * Smoke tests for the standalone `openListsDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 *
 * Uses real tmpdir-backed files (not `:memory:`) because the helper runs
 * against on-disk DBs in production; on-disk parity surfaces surprises here
 * rather than at runtime.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openListsDb } from '../open-lists-db.js';
import { listItems, lists } from '../schema.js';
import { listItemsForList } from '../services/list-items.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lists-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openListsDb', () => {
  it('creates the parent directory and opens a fresh DB with the expected pragmas', () => {
    const path = join(tmpDir, 'nested', 'sub', 'lists.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openListsDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the lists slice migration — `lists` + `list_items` tables exist and accept writes', () => {
    const path = join(tmpDir, 'lists.db');
    const { db, raw } = openListsDb(path);
    try {
      const tables = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['lists', 'list_items']));

      const list = db
        .insert(lists)
        .values({ name: 'Test list', kind: 'shopping', ownerApp: 'tests' })
        .returning()
        .get();
      expect(list?.id).toBeTypeOf('number');
      const listId = list?.id;
      if (listId === undefined) throw new Error('insert into lists did not return a row');

      const inserted = db
        .insert(listItems)
        .values({ listId, label: 'Milk', refKind: 'free' })
        .returning()
        .get();
      expect(inserted?.label).toBe('Milk');
      expect(listItemsForList(db, listId)).toHaveLength(1);
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations and rows persist', () => {
    const path = join(tmpDir, 'lists.db');
    const first = openListsDb(path);
    let listId: number;
    try {
      const row = first.db
        .insert(lists)
        .values({ name: 'Persisted', kind: 'todo', ownerApp: 'tests' })
        .returning()
        .get();
      if (row === undefined) throw new Error('seed insert returned no row');
      listId = row.id;
      first.db.insert(listItems).values({ listId, label: 'Eggs', refKind: 'free' }).run();
      expect(listItemsForList(first.db, listId)).toHaveLength(1);
    } finally {
      first.raw.close();
    }

    const second = openListsDb(path);
    try {
      const rows = listItemsForList(second.db, listId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.label).toBe('Eggs');
    } finally {
      second.raw.close();
    }
  });

  it('throws when the path points at a directory that cannot be opened as a DB file', () => {
    expect(() => openListsDb(tmpDir)).toThrow();
  });
});
