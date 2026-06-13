/**
 * Item documents service — link/unlink Paperless-ngx documents to
 * inventory items, list documents for an item.
 *
 * Each function takes an `InventoryDb` handle as its first argument; the
 * calling layer (pops-api modules, pops-inventory-api routers) resolves
 * the singleton or transaction handle to pass in. Mirrors the items /
 * locations / connections writer pattern (db-arg, typed errors).
 *
 * The live writer in `apps/pops-api/src/modules/inventory/documents/service.ts`
 * is the source of truth for the wire surface — this scaffold mirrors
 * its semantics so the PR2 reads-cutover can swap consumers over to
 * `documentsService.*` without a behavioural change.
 *
 * Pair uniqueness is enforced at the schema level via the
 * `uq_item_documents_pair` unique index on (item_id, paperless_document_id);
 * the service performs an explicit existence check first so callers get a
 * typed `DocumentConflictError` instead of a raw SQLITE_CONSTRAINT.
 */
import { and, asc, count, eq } from 'drizzle-orm';

import { homeInventory, itemDocuments } from '../schema.js';
import {
  DocumentConflictError,
  DocumentCreateFailedError,
  DocumentItemNotFoundError,
  DocumentNotFoundError,
} from './documents-errors.js';

import type { DocumentListResult, ItemDocumentRow, LinkDocumentInput } from './documents-types.js';
import type { InventoryDb } from './internal.js';

export {
  DOCUMENT_TYPES,
  type DocumentListResult,
  type DocumentType,
  type ItemDocument,
  type ItemDocumentRow,
  type LinkDocumentInput,
  toItemDocument,
} from './documents-types.js';

export {
  DocumentConflictError,
  DocumentCreateFailedError,
  DocumentItemNotFoundError,
  DocumentNotFoundError,
} from './documents-errors.js';

function assertItemExists(db: InventoryDb, id: string): void {
  const [row] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, id))
    .all();
  if (!row) throw new DocumentItemNotFoundError(id);
}

function findByPair(
  db: InventoryDb,
  itemId: string,
  paperlessDocumentId: number
): ItemDocumentRow | undefined {
  const [row] = db
    .select()
    .from(itemDocuments)
    .where(
      and(
        eq(itemDocuments.itemId, itemId),
        eq(itemDocuments.paperlessDocumentId, paperlessDocumentId)
      )
    )
    .all();
  return row;
}

/**
 * Link a Paperless-ngx document to an inventory item. Validates the item
 * exists and the (item, document) pair is not already linked.
 */
export function link(db: InventoryDb, input: LinkDocumentInput): ItemDocumentRow {
  assertItemExists(db, input.itemId);

  if (findByPair(db, input.itemId, input.paperlessDocumentId)) {
    throw new DocumentConflictError(input.itemId, input.paperlessDocumentId);
  }

  db.insert(itemDocuments)
    .values({
      itemId: input.itemId,
      paperlessDocumentId: input.paperlessDocumentId,
      documentType: input.documentType,
      title: input.title ?? null,
    })
    .run();

  const created = findByPair(db, input.itemId, input.paperlessDocumentId);
  if (!created) throw new DocumentCreateFailedError(input.itemId, input.paperlessDocumentId);
  return created;
}

/**
 * Unlink a document from an item by link ID. Throws
 * `DocumentNotFoundError` if no row matches.
 */
export function unlink(db: InventoryDb, id: number): void {
  const [row] = db
    .select({ id: itemDocuments.id })
    .from(itemDocuments)
    .where(eq(itemDocuments.id, id))
    .all();

  if (!row) throw new DocumentNotFoundError(id);

  db.delete(itemDocuments).where(eq(itemDocuments.id, id)).run();
}

/**
 * List all documents linked to a given item. Paginated; returns the
 * matching slice plus the full count for the filter.
 *
 * Rows are ordered by `item_documents.id` ascending. The id column is the
 * autoincrement PK, so this is insertion order — the contract callers
 * implicitly relied on under the legacy inline implementation, now made
 * explicit so pagination slices are deterministic across SQLite planner
 * versions and storage layouts.
 */
export function listForItem(
  db: InventoryDb,
  itemId: string,
  limit: number,
  offset: number
): DocumentListResult {
  const condition = eq(itemDocuments.itemId, itemId);

  const rows = db
    .select()
    .from(itemDocuments)
    .where(condition)
    .orderBy(asc(itemDocuments.id))
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = db.select({ total: count() }).from(itemDocuments).where(condition).all();

  return { rows, total: countResult?.total ?? 0 };
}
