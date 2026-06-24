/**
 * Shared types + helpers for the rejected/failed inbox queries.
 *
 * The cursor encoding (a `(timestamp, id)` tuple base64url-encoded with a
 * sentinel separator) is a single source of truth — both tabs paginate
 * `(timestamp DESC, id DESC)` with the same monotonicity guarantees.
 */
import type { IngestSourceKind } from '../schema.js';

export type RejectionReason =
  | 'wrong-recipe'
  | 'low-quality-extraction'
  | 'duplicate'
  | 'not-a-recipe'
  | 'other';

export interface RejectedRow {
  versionId: number;
  recipeSlug: string;
  sourceId: number;
  title: string | null;
  reason: RejectionReason;
  note: string | null;
  rejectedAt: string;
  ingestKind: IngestSourceKind;
  sourceUrl: string | null;
  ingestCostUsd: number | null;
}

export interface FailedRow {
  sourceId: number;
  ingestKind: IngestSourceKind;
  sourceUrl: string | null;
  errorCode: string;
  errorMessage: string;
  ingestedAt: string;
  attempts: number;
}

export interface ListPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ListRejectedFilter {
  reasons?: RejectionReason[];
  kinds?: IngestSourceKind[];
  sinceDays?: 7 | 30 | 90 | null;
  cursor?: { id: number; sortKey: string } | null;
  limit: number;
}

export interface ListFailedFilter {
  errorCodes?: string[];
  kinds?: IngestSourceKind[];
  sinceDays?: 7 | 30 | 90 | null;
  cursor?: { id: number; sortKey: string } | null;
  limit: number;
}

const CURSOR_SEP = '|';

export function encodeCursor(timestamp: string, id: number): string {
  return Buffer.from(`${timestamp}${CURSOR_SEP}${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { id: number; sortKey: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf(CURSOR_SEP);
    if (sep === -1) return null;
    const id = Number(decoded.slice(sep + 1));
    if (!Number.isInteger(id) || id <= 0) return null;
    const sortKey = decoded.slice(0, sep);
    if (sortKey.length === 0) return null;
    return { id, sortKey };
  } catch {
    return null;
  }
}

/**
 * Returns the `datetime('now', '-Nd')` SQL string equivalent for the
 * supported `sinceDays` window, or `null` when the filter is unset / 'all'.
 * Centralised so both tabs interpret the chip identically.
 */
export function sinceDaysAgoIso(sinceDays: 7 | 30 | 90 | null | undefined): string | null {
  if (sinceDays === null || sinceDays === undefined) return null;
  const now = Date.now();
  const ms = sinceDays * 24 * 60 * 60 * 1000;
  return new Date(now - ms)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
}
