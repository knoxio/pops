/**
 * Inventory documents read/write surface.
 *
 * All paths (`linkDocument`, `unlinkDocument`, `listDocumentsForItem`)
 * forward into `documentsService` from the pillar's persistence barrel.
 * The drizzle handle is passed in from the tRPC context so the service
 * stands alone of pops-api in the dep graph.
 *
 * Typed errors raised by the package (`DocumentItemNotFoundError`,
 * `DocumentConflictError`, `DocumentNotFoundError`,
 * `DocumentCreateFailedError`) are translated back to the in-tree
 * `NotFoundError` / `ConflictError` so the router's `instanceof`
 * checks keep working.
 */
import {
  DocumentConflictError,
  DocumentCreateFailedError,
  DocumentItemNotFoundError,
  DocumentNotFoundError,
  documentsService,
  type InventoryDb,
} from '../../../db/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';

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

export interface LinkDocumentInput {
  itemId: string;
  paperlessDocumentId: number;
  documentType: DocumentType;
  title?: string;
}

/**
 * Link a Paperless-ngx document to an inventory item.
 * Validates the item exists and the pair is not already linked.
 */
export function linkDocument(db: InventoryDb, input: LinkDocumentInput): ItemDocumentRow {
  return translate(() =>
    documentsService.link(db, {
      itemId: input.itemId,
      paperlessDocumentId: input.paperlessDocumentId,
      documentType: input.documentType,
      title: input.title ?? null,
    })
  );
}

/**
 * Unlink a document from an item by link ID.
 */
export function unlinkDocument(db: InventoryDb, id: number): void {
  translate(() => documentsService.unlink(db, id));
}

/**
 * List all documents linked to a given item.
 */
export function listDocumentsForItem(
  db: InventoryDb,
  itemId: string,
  limit: number,
  offset: number
): DocumentListResult {
  return documentsService.listForItem(db, itemId, limit, offset);
}
