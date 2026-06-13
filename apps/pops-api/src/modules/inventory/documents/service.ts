/**
 * Inventory documents read/write surface — PRD-176 PR 2 cutover.
 *
 * Read/write split during the migration window (mirrors PRD-175 PR 2 +
 * PRD-173 PR 2 + PRD-179 PR 2):
 *  - `listDocumentsForItem` is routed through `documentsService` from
 *    `@pops/inventory-db` against the inventory pillar handle
 *    (`getInventoryDrizzle()`). Reads now resolve from the canonical
 *    package implementation.
 *  - Writes (`linkDocument`, `unlinkDocument`) keep their inline drizzle
 *    statements against the same handle to preserve the existing
 *    read-after-write guarantee on the inventory pillar's SQLite file.
 *    Both calls validate via in-line reads against the same handle, so
 *    the writes stay inline until PRD-176 PR 3 collapses them onto
 *    `documentsService.{link, unlink}`.
 *
 * The legacy router stays mounted in pops-api as a fall-through while the
 * dispatcher cutover routes `inventory.documents.*` traffic to
 * pops-inventory-api. Consumers (router.ts here) keep the same wire
 * surface — no caller churn.
 */
import { and, eq } from 'drizzle-orm';

import { homeInventory, itemDocuments } from '@pops/db-types';
import { documentsService } from '@pops/inventory-db';

import { getInventoryDrizzle } from '../../../db/inventory-handle.js';
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
  const db = getInventoryDrizzle();

  const [item] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemId))
    .all();

  if (!item) throw new NotFoundError('Inventory item', itemId);

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
  const db = getInventoryDrizzle();

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
  return documentsService.listForItem(getInventoryDrizzle(), itemId, limit, offset);
}
