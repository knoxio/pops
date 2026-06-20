/**
 * Paperless-ngx API types — raw API responses and mapped domain types.
 *
 * Paperless-ngx REST API v3 returns paginated lists and detail objects.
 * Auth: Token-based via Authorization header.
 */

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PaperlessApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'PaperlessApiError';
  }
}

// ---------------------------------------------------------------------------
// Raw API response types
// ---------------------------------------------------------------------------

export interface RawPaperlessPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface RawPaperlessDocument {
  id: number;
  correspondent: number | null;
  document_type: number | null;
  title: string;
  content: string;
  tags: number[];
  created: string;
  created_date: string;
  modified: string;
  added: string;
  archive_serial_number: number | null;
  original_file_name: string;
  archived_file_name: string | null;
  notes: { id: number; note: string; created: string }[];
}

export interface RawPaperlessCorrespondent {
  id: number;
  slug: string;
  name: string;
  match: string;
  matching_algorithm: number;
  is_insensitive: boolean;
  document_count: number;
}

export interface RawPaperlessTag {
  id: number;
  slug: string;
  name: string;
  colour: number;
  match: string;
  matching_algorithm: number;
  is_insensitive: boolean;
  is_inbox_tag: boolean;
  document_count: number;
}

export interface RawPaperlessDocumentType {
  id: number;
  slug: string;
  name: string;
  match: string;
  matching_algorithm: number;
  is_insensitive: boolean;
  document_count: number;
}

// ---------------------------------------------------------------------------
// Mapped domain types
// ---------------------------------------------------------------------------

export interface PaperlessDocument {
  id: number;
  correspondentId: number | null;
  documentTypeId: number | null;
  title: string;
  content: string;
  tagIds: number[];
  created: string;
  createdDate: string;
  modified: string;
  added: string;
  archiveSerialNumber: number | null;
  originalFileName: string;
  archivedFileName: string | null;
}

export interface PaperlessCorrespondent {
  id: number;
  slug: string;
  name: string;
  documentCount: number;
}

export interface PaperlessTag {
  id: number;
  slug: string;
  name: string;
  colour: number;
  isInboxTag: boolean;
  documentCount: number;
}

export interface PaperlessDocumentType {
  id: number;
  slug: string;
  name: string;
  documentCount: number;
}

export interface PaperlessSearchResult {
  documents: PaperlessDocument[];
  count: number;
  next: string | null;
  previous: string | null;
}
