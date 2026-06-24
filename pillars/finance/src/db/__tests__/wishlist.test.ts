/**
 * Invariant tests for the wish-list service against an in-memory SQLite
 * seeded with the canonical `wish_list` DDL — DB + service layer only.
 *
 * The DDL is inlined rather than applied from the migration journal so
 * each test runs against a lean single-table fixture instead of the full
 * finance schema.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { WishListItemNotFoundError } from '../errors.js';
import {
  createWishListItem,
  deleteWishListItem,
  getWishListItem,
  listWishListItems,
  updateWishListItem,
} from '../services/wishlist.js';

import type { FinanceDb } from '../services/internal.js';

const WISH_LIST_DDL = `
CREATE TABLE wish_list (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  item text NOT NULL,
  target_amount real,
  saved real,
  priority text,
  url text,
  notes text,
  last_edited_time text NOT NULL
);
CREATE UNIQUE INDEX wish_list_notion_id_unique ON wish_list (notion_id);
`;

function freshDb(): FinanceDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(WISH_LIST_DDL);
  return drizzle(raw);
}

describe('createWishListItem', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a row with the supplied fields and a generated UUID', () => {
    const created = createWishListItem(db, {
      item: 'Espresso machine',
      targetAmount: 1200,
      saved: 250,
      priority: 'Soon',
      url: 'https://example.com/machine',
      notes: 'Wait for sale',
    });

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created.item).toBe('Espresso machine');
    expect(created.targetAmount).toBe(1200);
    expect(created.saved).toBe(250);
    expect(created.priority).toBe('Soon');
    expect(created.url).toBe('https://example.com/machine');
    expect(created.notes).toBe('Wait for sale');
    expect(created.lastEditedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults optional numeric and text fields to null', () => {
    const created = createWishListItem(db, { item: 'Just the item' });
    expect(created.targetAmount).toBeNull();
    expect(created.saved).toBeNull();
    expect(created.priority).toBeNull();
    expect(created.url).toBeNull();
    expect(created.notes).toBeNull();
  });
});

describe('getWishListItem', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the persisted row by id', () => {
    const created = createWishListItem(db, { item: 'Bike rack' });
    const fetched = getWishListItem(db, created.id);
    expect(fetched).toEqual(created);
  });

  it('throws WishListItemNotFoundError for an unknown id', () => {
    expect(() => getWishListItem(db, 'missing')).toThrow(WishListItemNotFoundError);
  });
});

describe('listWishListItems', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
    createWishListItem(db, { item: 'Apple monitor', priority: 'Soon' });
    createWishListItem(db, { item: 'Apple keyboard', priority: 'Needing' });
    createWishListItem(db, { item: 'Couch', priority: 'One Day' });
  });

  it('returns all rows sorted by item with a total count', () => {
    const result = listWishListItems(db, { limit: 50, offset: 0 });
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.item)).toEqual(['Apple keyboard', 'Apple monitor', 'Couch']);
  });

  it('filters by LIKE on item (ASCII case-insensitive per SQLite default)', () => {
    const result = listWishListItems(db, { search: 'apple', limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.item.startsWith('Apple'))).toBe(true);
  });

  it('filters by priority equality', () => {
    const result = listWishListItems(db, { priority: 'Soon', limit: 50, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.priority).toBe('Soon');
  });

  it('paginates via limit + offset and reports the unpaginated total', () => {
    const page1 = listWishListItems(db, { limit: 2, offset: 0 });
    const page2 = listWishListItems(db, { limit: 2, offset: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    expect(page2.total).toBe(3);
    expect(page2.rows).toHaveLength(1);
  });
});

describe('updateWishListItem', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('patches only the supplied fields and bumps lastEditedTime', async () => {
    const created = createWishListItem(db, { item: 'Tent', saved: 100 });
    const original = created.lastEditedTime;
    await new Promise((r) => setTimeout(r, 5));

    const updated = updateWishListItem(db, created.id, { saved: 250, priority: 'Soon' });
    expect(updated.id).toBe(created.id);
    expect(updated.item).toBe('Tent');
    expect(updated.saved).toBe(250);
    expect(updated.priority).toBe('Soon');
    expect(updated.lastEditedTime).not.toBe(original);
  });

  it('treats explicit null as a value (clears the field)', () => {
    const created = createWishListItem(db, { item: 'Helmet', notes: 'Black, matte' });
    const updated = updateWishListItem(db, created.id, { notes: null });
    expect(updated.notes).toBeNull();
  });

  it('is a no-op when the patch is empty (but still returns the row)', () => {
    const created = createWishListItem(db, { item: 'Mug' });
    const updated = updateWishListItem(db, created.id, {});
    expect(updated.lastEditedTime).toBe(created.lastEditedTime);
    expect(updated.item).toBe('Mug');
  });

  it('throws WishListItemNotFoundError for an unknown id', () => {
    expect(() => updateWishListItem(db, 'missing', { item: 'x' })).toThrow(
      WishListItemNotFoundError
    );
  });
});

describe('deleteWishListItem', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('removes the row and subsequent get throws', () => {
    const created = createWishListItem(db, { item: 'Backpack' });
    deleteWishListItem(db, created.id);
    expect(() => getWishListItem(db, created.id)).toThrow(WishListItemNotFoundError);
  });

  it('throws WishListItemNotFoundError when the row is already gone', () => {
    expect(() => deleteWishListItem(db, 'missing')).toThrow(WishListItemNotFoundError);
  });
});
