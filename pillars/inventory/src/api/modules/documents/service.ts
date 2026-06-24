/**
 * Inventory documents read/write surface over `documentsService` (src/db).
 *
 * Typed errors from the db layer (`DocumentItemNotFoundError`,
 * `DocumentConflictError`, `DocumentNotFoundError`,
 * `DocumentCreateFailedError`) are translated to the in-tree
 * `NotFoundError` / `ConflictError` so the REST error-mapping layer
 * turns them into 404/409.
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
 * Validates the item exists and the (item, document) pair is not already linked.
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

export function unlinkDocument(db: InventoryDb, id: number): void {
  translate(() => documentsService.unlink(db, id));
}

export function listDocumentsForItem(
  db: InventoryDb,
  itemId: string,
  limit: number,
  offset: number
): DocumentListResult {
  return documentsService.listForItem(db, itemId, limit, offset);
}
