/**
 * Public types for the transaction-corrections slice.
 *
 * Split from `transaction-corrections.ts` so neither file exceeds the
 * 200-line cap. CRUD handlers live in `transaction-corrections.ts`,
 * matchers in `transaction-corrections-matching.ts`, both consume the
 * types declared here.
 */
import type { transactionCorrections } from '../schema.js';

/** Raw drizzle row shape — matches the persisted `transaction_corrections` record. */
export type TransactionCorrectionRow = typeof transactionCorrections.$inferSelect;

/** Discriminant for how `descriptionPattern` is interpreted against an incoming description. */
export type TransactionCorrectionMatchType = 'exact' | 'contains' | 'regex';

/** Optional `transaction_type` tag stamped onto the matched transaction. */
export type TransactionCorrectionTransactionType = 'purchase' | 'transfer' | 'income';

/**
 * Mutable subset accepted on create / upsert.
 *
 * `tags` is the structured form callers pass in; the service layer is
 * responsible for serialising it into the on-disk JSON string the schema
 * stores.
 */
export interface CreateTransactionCorrectionInput {
  descriptionPattern: string;
  matchType: TransactionCorrectionMatchType;
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  tags?: string[];
  transactionType?: TransactionCorrectionTransactionType | null;
  priority?: number;
}

/** PATCH-semantic update input — every field is optional. */
export interface UpdateTransactionCorrectionInput {
  descriptionPattern?: string;
  matchType?: TransactionCorrectionMatchType;
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  tags?: string[];
  transactionType?: TransactionCorrectionTransactionType | null;
  isActive?: boolean;
  confidence?: number;
  priority?: number;
}

/** Result of a paginated list call. */
export interface TransactionCorrectionListResult {
  rows: TransactionCorrectionRow[];
  total: number;
}

/** Filters + pagination accepted by `listTransactionCorrections`. */
export interface TransactionCorrectionListQuery {
  minConfidence?: number;
  matchType?: TransactionCorrectionMatchType;
  limit: number;
  offset: number;
}

/**
 * Canonical pattern normalisation used by the matcher and on insert/update.
 *
 * Uppercases, strips digits, collapses whitespace, and trims. Kept identical
 * to the in-tree implementation so a cutover (PR 3) is a routing flip — not
 * a behavioural change.
 */
export function normalizeDescription(description: string): string {
  return description.toUpperCase().replaceAll(/\d+/g, '').replaceAll(/\s+/g, ' ').trim();
}
