/**
 * Invariant tests for the documents service against an in-memory SQLite
 * seeded with the canonical `home_inventory` + `item_documents` tables.
 * Pure DB + service layer.
 *
 * The `home_inventory` and `item_documents` DDL is inlined here because
 * the canonical baseline migration bundles unrelated FK tables. The
 * locations migration is read from the package's migrations dir so the FK
 * target exists.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { documentsService } from '../index.js';
import {
  DocumentConflictError,
  DocumentItemNotFoundError,
  DocumentNotFoundError,
} from '../services/documents-errors.js';
import { create as createItem } from '../services/items.js';

import type { Database } from 'better-sqlite3';

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

const ITEM_DOCUMENTS_DDL = `
CREATE TABLE item_documents (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  item_id text NOT NULL REFERENCES home_inventory(id) ON DELETE CASCADE,
  paperless_document_id integer NOT NULL,
  document_type text NOT NULL,
  title text,
  created_at text NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX uq_item_documents_pair ON item_documents (item_id, paperless_document_id);
CREATE INDEX idx_item_documents_item ON item_documents (item_id);
CREATE INDEX idx_item_documents_doc ON item_documents (paperless_document_id);
`;

interface FreshDb {
  db: InventoryDb;
  raw: Database;
}

function freshDb(): FreshDb {
  const raw = new BetterSqlite3(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(LOCATIONS_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  raw.exec(HOME_INVENTORY_DDL);
  raw.exec(ITEM_DOCUMENTS_DDL);
  return { db: drizzle(raw), raw };
}

function seedItem(db: InventoryDb, name = 'Test Item'): string {
  return createItem(db, { itemName: name }).id;
}

describe('documentsService.link', () => {
  let db: InventoryDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('links a document to an item and returns the row', () => {
    const itemId = seedItem(db);
    const row = documentsService.link(db, {
      itemId,
      paperlessDocumentId: 42,
      documentType: 'receipt',
      title: 'Purchase Receipt',
    });
    expect(row.itemId).toBe(itemId);
    expect(row.paperlessDocumentId).toBe(42);
    expect(row.documentType).toBe('receipt');
    expect(row.title).toBe('Purchase Receipt');
    expect(typeof row.id).toBe('number');
    expect(row.createdAt).toBeTruthy();
  });

  it('links without title and stores null', () => {
    const itemId = seedItem(db);
    const row = documentsService.link(db, {
      itemId,
      paperlessDocumentId: 7,
      documentType: 'warranty',
    });
    expect(row.title).toBeNull();
  });

  it('coerces undefined title to null', () => {
    const itemId = seedItem(db);
    const row = documentsService.link(db, {
      itemId,
      paperlessDocumentId: 8,
      documentType: 'manual',
      title: undefined,
    });
    expect(row.title).toBeNull();
  });

  it('rejects duplicate (item, paperless) pairs with DocumentConflictError', () => {
    const itemId = seedItem(db);
    documentsService.link(db, { itemId, paperlessDocumentId: 42, documentType: 'receipt' });
    expect(() =>
      documentsService.link(db, { itemId, paperlessDocumentId: 42, documentType: 'receipt' })
    ).toThrowError(DocumentConflictError);
  });

  it('allows the same paperless document linked to different items', () => {
    const itemA = seedItem(db, 'A');
    const itemB = seedItem(db, 'B');
    documentsService.link(db, { itemId: itemA, paperlessDocumentId: 42, documentType: 'receipt' });
    const second = documentsService.link(db, {
      itemId: itemB,
      paperlessDocumentId: 42,
      documentType: 'receipt',
    });
    expect(second.itemId).toBe(itemB);
    expect(second.paperlessDocumentId).toBe(42);
  });

  it('allows different documents linked to the same item', () => {
    const itemId = seedItem(db);
    documentsService.link(db, { itemId, paperlessDocumentId: 1, documentType: 'receipt' });
    const second = documentsService.link(db, {
      itemId,
      paperlessDocumentId: 2,
      documentType: 'warranty',
    });
    expect(second.paperlessDocumentId).toBe(2);
  });

  it('throws DocumentItemNotFoundError when the item is missing', () => {
    expect(() =>
      documentsService.link(db, {
        itemId: 'nope',
        paperlessDocumentId: 1,
        documentType: 'receipt',
      })
    ).toThrowError(DocumentItemNotFoundError);
  });

  it('does not insert a row when the item is missing', () => {
    expect(() =>
      documentsService.link(db, {
        itemId: 'nope',
        paperlessDocumentId: 1,
        documentType: 'receipt',
      })
    ).toThrow();
    const itemId = seedItem(db);
    const result = documentsService.listForItem(db, itemId, 50, 0);
    expect(result.total).toBe(0);
  });
});

describe('documentsService.unlink', () => {
  let db: InventoryDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('removes an existing link', () => {
    const itemId = seedItem(db);
    const row = documentsService.link(db, {
      itemId,
      paperlessDocumentId: 42,
      documentType: 'receipt',
    });
    documentsService.unlink(db, row.id);
    const result = documentsService.listForItem(db, itemId, 50, 0);
    expect(result.total).toBe(0);
  });

  it('throws DocumentNotFoundError for an unknown id', () => {
    expect(() => documentsService.unlink(db, 999)).toThrowError(DocumentNotFoundError);
  });

  it('does not affect other links', () => {
    const itemId = seedItem(db);
    const a = documentsService.link(db, {
      itemId,
      paperlessDocumentId: 1,
      documentType: 'receipt',
    });
    documentsService.link(db, { itemId, paperlessDocumentId: 2, documentType: 'warranty' });
    documentsService.unlink(db, a.id);
    const result = documentsService.listForItem(db, itemId, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]!.paperlessDocumentId).toBe(2);
  });
});

describe('documentsService.listForItem', () => {
  let db: InventoryDb;
  let raw: Database;
  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  it('returns empty rows + zero total when the item has no documents', () => {
    const itemId = seedItem(db);
    const result = documentsService.listForItem(db, itemId, 50, 0);
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('returns only documents linked to the requested item', () => {
    const itemA = seedItem(db, 'A');
    const itemB = seedItem(db, 'B');
    documentsService.link(db, { itemId: itemA, paperlessDocumentId: 10, documentType: 'receipt' });
    documentsService.link(db, { itemId: itemB, paperlessDocumentId: 20, documentType: 'manual' });

    const result = documentsService.listForItem(db, itemA, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.paperlessDocumentId).toBe(10);
  });

  it('orders by id ascending (insertion order) for stable pagination', () => {
    const itemId = seedItem(db);
    for (let i = 1; i <= 5; i++) {
      documentsService.link(db, {
        itemId,
        paperlessDocumentId: i,
        documentType: 'receipt',
      });
    }
    const result = documentsService.listForItem(db, itemId, 50, 0);
    expect(result.rows.map((r) => r.paperlessDocumentId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('respects limit and offset and reports the unpaginated total', () => {
    const itemId = seedItem(db);
    for (let i = 1; i <= 5; i++) {
      documentsService.link(db, {
        itemId,
        paperlessDocumentId: i,
        documentType: 'receipt',
      });
    }
    const page1 = documentsService.listForItem(db, itemId, 2, 0);
    expect(page1.total).toBe(5);
    expect(page1.rows.map((r) => r.paperlessDocumentId)).toEqual([1, 2]);

    const page2 = documentsService.listForItem(db, itemId, 2, 2);
    expect(page2.total).toBe(5);
    expect(page2.rows.map((r) => r.paperlessDocumentId)).toEqual([3, 4]);

    const page3 = documentsService.listForItem(db, itemId, 2, 4);
    expect(page3.total).toBe(5);
    expect(page3.rows.map((r) => r.paperlessDocumentId)).toEqual([5]);
  });

  it('cascades deletes when the parent item is removed', () => {
    const itemId = seedItem(db);
    documentsService.link(db, { itemId, paperlessDocumentId: 1, documentType: 'receipt' });
    documentsService.link(db, { itemId, paperlessDocumentId: 2, documentType: 'warranty' });

    raw.prepare('DELETE FROM home_inventory WHERE id = ?').run(itemId);

    const remaining = raw
      .prepare('SELECT COUNT(*) as c FROM item_documents WHERE item_id = ?')
      .get(itemId) as { c: number };
    expect(remaining.c).toBe(0);
  });
});

describe('toItemDocument', () => {
  it('round-trips all DB row fields to the public shape', () => {
    const row = {
      id: 7,
      itemId: 'item-1',
      paperlessDocumentId: 42,
      documentType: 'receipt',
      title: 'Receipt',
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(documentsService.toItemDocument(row)).toEqual(row);
  });

  it('preserves null title', () => {
    const row = {
      id: 8,
      itemId: 'item-2',
      paperlessDocumentId: 1,
      documentType: 'manual',
      title: null,
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(documentsService.toItemDocument(row).title).toBeNull();
  });
});
