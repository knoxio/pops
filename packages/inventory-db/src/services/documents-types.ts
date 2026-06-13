/**
 * Input and result types for the item documents service, plus the
 * `toItemDocument` row→API mapper.
 *
 * Validation (zod) lives with the router layers — this package stays
 * HTTP-agnostic and only exposes the service surface, row types, and
 * the canonical row→public-shape mapper needed to call it.
 */
import type { ItemDocumentRow } from '@pops/db-types';

export type { ItemDocumentRow };

/** Document types accepted by the link mutation. */
export const DOCUMENT_TYPES = ['receipt', 'warranty', 'manual', 'invoice', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Input for linking a Paperless-ngx document to an inventory item. */
export interface LinkDocumentInput {
  itemId: string;
  paperlessDocumentId: number;
  documentType: string;
  title?: string | null;
}

/** Paginated list result for item documents. */
export interface DocumentListResult {
  rows: ItemDocumentRow[];
  total: number;
}

/** Public API shape for an item document link. */
export interface ItemDocument {
  id: number;
  itemId: string;
  paperlessDocumentId: number;
  documentType: string;
  title: string | null;
  createdAt: string;
}

/** Map a SQLite row to the public API shape. */
export function toItemDocument(row: ItemDocumentRow): ItemDocument {
  return {
    id: row.id,
    itemId: row.itemId,
    paperlessDocumentId: row.paperlessDocumentId,
    documentType: row.documentType,
    title: row.title,
    createdAt: row.createdAt,
  };
}
