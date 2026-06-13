/**
 * Inventory documents read/write surface — PRD-176 PR 3 cutover.
 *
 * All paths (`linkDocument`, `unlinkDocument`, `listDocumentsForItem`)
 * now forward into `documentsService` from `@pops/inventory-db` against
 * the inventory pillar handle (`getInventoryDrizzle()`). PR 2 (#3033)
 * cut the reads; this PR closes the split so reads and writes resolve
 * against the same canonical package implementation on the inventory
 * pillar's SQLite file.
 *
 * Typed errors raised by the package (`DocumentItemNotFoundError`,
 * `DocumentConflictError`, `DocumentNotFoundError`,
 * `DocumentCreateFailedError`) are translated back to the in-tree
 * `NotFoundError` / `ConflictError` so the router's `instanceof`
 * checks keep working (mirrors PRD-173 PR 2 / PRD-175 PR 2 pattern).
 *
 * The legacy router stays mounted in pops-api as a fall-through while
 * the dispatcher cutover routes `inventory.documents.*` traffic to
 * pops-inventory-api. Consumers (router.ts here) keep the same wire
 * surface — no caller churn.
 */
import {
  DocumentConflictError,
  DocumentCreateFailedError,
  DocumentItemNotFoundError,
  DocumentNotFoundError,
  documentsService,
} from '@pops/inventory-db';

import { getInventoryDrizzle } from '../../../db/inventory-handle.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { DocumentType, ItemDocumentRow } from './types.js';

export interface DocumentListResult {
  rows: ItemDocumentRow[];
  total: number;
}

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof DocumentItemNotFoundError) {
      throw new NotFoundError('Inventory item', err.id);
    }
    if (err instanceof DocumentNotFoundError) {
      throw new NotFoundError('Item document link', String(err.id));
    }
    if (err instanceof DocumentConflictError) {
      throw new ConflictError(err.message);
    }
    if (err instanceof DocumentCreateFailedError) {
      throw new NotFoundError('Item document link', `${err.itemId}-${err.paperlessDocumentId}`);
    }
    throw err;
  }
}

/**
 * Link a Paperless-ngx document to an inventory item.
 * Validates the item exists and the pair is not already linked.
 */
export function linkDocument(
  itemId: string,
  paperlessDocumentId: number,
  documentType: DocumentType,
  title?: string
): ItemDocumentRow {
  return translate(() =>
    documentsService.link(getInventoryDrizzle(), {
      itemId,
      paperlessDocumentId,
      documentType,
      title: title ?? null,
    })
  );
}

/**
 * Unlink a document from an item by link ID.
 */
export function unlinkDocument(id: number): void {
  translate(() => documentsService.unlink(getInventoryDrizzle(), id));
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
