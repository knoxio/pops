import { and, count, eq } from 'drizzle-orm';

/**
 * Item documents service — link/unlink Paperless-ngx documents to inventory items.
 */
import { homeInventory, itemDocuments } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { ItemDocumentRow } from './types.js';

export interface DocumentListResult {
  rows: ItemDocumentRow[];
  total: number;
}

/**
 * Link a Paperless-ngx document to an inventory item.
 * Validates the item exists and the pair is not already linked.
 */
export function linkDocument(
  itemId: string,
  paperlessDocumentId: number,
  documentType: string,
  title?: string
): ItemDocumentRow {
  const db = getDrizzle();

  // Validate item exists
  const [item] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemId))
    .all();

  if (!item) throw new NotFoundError('Inventory item', itemId);

  // Check for existing link
  const [existing] = db
    .select({ id: itemDocuments.id })
    .from(itemDocuments)
    .where(
      and(
        eq(itemDocuments.itemId, itemId),
        eq(itemDocuments.paperlessDocumentId, paperlessDocumentId)
      )
    )
    .all();

  if (existing) {
    throw new ConflictError(
      `Document '${paperlessDocumentId}' is already linked to item '${itemId}'`
    );
  }

  db.insert(itemDocuments)
    .values({ itemId, paperlessDocumentId, documentType, title: title ?? null })
    .run();

  // Fetch the created row
  const [created] = db
    .select()
    .from(itemDocuments)
    .where(
      and(
        eq(itemDocuments.itemId, itemId),
        eq(itemDocuments.paperlessDocumentId, paperlessDocumentId)
      )
    )
    .all();

  if (!created) throw new NotFoundError('Item document link', `${itemId}-${paperlessDocumentId}`);
  return created;
}

/**
 * Unlink a document from an item by link ID.
 */
export function unlinkDocument(id: number): void {
  const db = getDrizzle();

  const [row] = db
    .select({ id: itemDocuments.id })
    .from(itemDocuments)
    .where(eq(itemDocuments.id, id))
    .all();

  if (!row) throw new NotFoundError('Item document link', String(id));

  db.delete(itemDocuments).where(eq(itemDocuments.id, id)).run();
}

/**
 * List all documents linked to a given item.
 */
export function listDocumentsForItem(
  itemId: string,
  limit: number,
  offset: number
): DocumentListResult {
  const db = getDrizzle();

  const condition = eq(itemDocuments.itemId, itemId);

  const rows = db.select().from(itemDocuments).where(condition).limit(limit).offset(offset).all();

  const [countResult] = db.select({ total: count() }).from(itemDocuments).where(condition).all();

  return { rows, total: countResult?.total ?? 0 };
}
