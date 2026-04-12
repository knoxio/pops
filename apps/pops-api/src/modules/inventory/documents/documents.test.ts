/**
 * Item documents router tests.
 */
import { TRPCError } from '@trpc/server';
import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCaller,
  seedInventoryItem,
  seedItemDocument,
  setupTestContext,
} from '../../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('inventory.documents.link', () => {
  it('links a document to an item and returns the link', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Test Item' });

    const result = await caller.inventory.documents.link({
      itemId,
      paperlessDocumentId: 42,
      documentType: 'receipt',
      title: 'Purchase Receipt',
    });

    expect(result.data).toMatchObject({
      itemId,
      paperlessDocumentId: 42,
      documentType: 'receipt',
      title: 'Purchase Receipt',
    });
    expect(result.data.id).toBeTypeOf('number');
    expect(result.data.createdAt).toBeTypeOf('string');
    expect(result.message).toBe('Document linked');
  });

  it('links without title', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Test Item' });

    const result = await caller.inventory.documents.link({
      itemId,
      paperlessDocumentId: 10,
      documentType: 'warranty',
    });

    expect(result.data.title).toBeNull();
  });

  it('throws CONFLICT when linking same document twice', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Test Item' });

    await caller.inventory.documents.link({
      itemId,
      paperlessDocumentId: 42,
      documentType: 'receipt',
    });

    await expect(
      caller.inventory.documents.link({
        itemId,
        paperlessDocumentId: 42,
        documentType: 'receipt',
      })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.documents.link({
        itemId,
        paperlessDocumentId: 42,
        documentType: 'receipt',
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe('CONFLICT');
    }
  });

  it('throws NOT_FOUND when item does not exist', async () => {
    await expect(
      caller.inventory.documents.link({
        itemId: 'nonexistent',
        paperlessDocumentId: 42,
        documentType: 'receipt',
      })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.documents.link({
        itemId: 'nonexistent',
        paperlessDocumentId: 42,
        documentType: 'receipt',
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });

  it('allows same document linked to different items', async () => {
    const itemA = seedInventoryItem(db, { item_name: 'Item A' });
    const itemB = seedInventoryItem(db, { item_name: 'Item B' });

    const resultA = await caller.inventory.documents.link({
      itemId: itemA,
      paperlessDocumentId: 42,
      documentType: 'receipt',
    });

    const resultB = await caller.inventory.documents.link({
      itemId: itemB,
      paperlessDocumentId: 42,
      documentType: 'receipt',
    });

    expect(resultA.data.itemId).toBe(itemA);
    expect(resultB.data.itemId).toBe(itemB);
  });

  it('persists to the database', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Test Item' });

    await caller.inventory.documents.link({
      itemId,
      paperlessDocumentId: 42,
      documentType: 'manual',
      title: 'User Manual',
    });

    const row = db
      .prepare('SELECT * FROM item_documents WHERE item_id = ? AND paperless_document_id = ?')
      .get(itemId, 42) as
      | { item_id: string; paperless_document_id: number; document_type: string; title: string }
      | undefined;

    expect(row).toBeDefined();
    expect(row!.item_id).toBe(itemId);
    expect(row!.paperless_document_id).toBe(42);
    expect(row!.document_type).toBe('manual');
    expect(row!.title).toBe('User Manual');
  });
});

describe('inventory.documents.unlink', () => {
  it('removes an existing document link', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Test Item' });
    const linkId = seedItemDocument(db, { item_id: itemId, paperless_document_id: 42 });

    const result = await caller.inventory.documents.unlink({ id: linkId });

    expect(result.message).toBe('Document unlinked');

    const row = db.prepare('SELECT * FROM item_documents WHERE id = ?').get(linkId);
    expect(row).toBeUndefined();
  });

  it('throws NOT_FOUND for nonexistent link', async () => {
    await expect(caller.inventory.documents.unlink({ id: 999 })).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.documents.unlink({ id: 999 });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });
});

describe('inventory.documents.listForItem', () => {
  it('returns empty list when no documents linked', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Lonely Item' });

    const result = await caller.inventory.documents.listForItem({ itemId });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('returns linked documents for an item', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Test Item' });
    seedItemDocument(db, { item_id: itemId, paperless_document_id: 10, document_type: 'receipt' });
    seedItemDocument(db, { item_id: itemId, paperless_document_id: 20, document_type: 'warranty' });

    const result = await caller.inventory.documents.listForItem({ itemId });

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it('does not return documents from other items', async () => {
    const itemA = seedInventoryItem(db, { item_name: 'Item A' });
    const itemB = seedInventoryItem(db, { item_name: 'Item B' });
    seedItemDocument(db, { item_id: itemA, paperless_document_id: 10 });
    seedItemDocument(db, { item_id: itemB, paperless_document_id: 20 });

    const result = await caller.inventory.documents.listForItem({ itemId: itemA });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.paperlessDocumentId).toBe(10);
  });

  it('paginates results', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Test Item' });

    for (let i = 0; i < 3; i++) {
      seedItemDocument(db, { item_id: itemId, paperless_document_id: i + 1 });
    }

    const page1 = await caller.inventory.documents.listForItem({
      itemId,
      limit: 2,
      offset: 0,
    });

    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await caller.inventory.documents.listForItem({
      itemId,
      limit: 2,
      offset: 2,
    });

    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

describe('inventory.documents auth', () => {
  it('throws UNAUTHORIZED without auth on link', async () => {
    const unauthCaller = createCaller(false);
    await expect(
      unauthCaller.inventory.documents.link({
        itemId: 'a',
        paperlessDocumentId: 1,
        documentType: 'receipt',
      })
    ).rejects.toThrow(TRPCError);
  });

  it('throws UNAUTHORIZED without auth on unlink', async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.documents.unlink({ id: 1 })).rejects.toThrow(TRPCError);
  });

  it('throws UNAUTHORIZED without auth on listForItem', async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.documents.listForItem({ itemId: 'a' })).rejects.toThrow(
      TRPCError
    );
  });
});
