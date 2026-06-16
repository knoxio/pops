/**
 * Read-only projections over the `transactions` table that back the
 * autocomplete / rule-preview endpoints. Split from `transactions.ts` to
 * keep that file under the per-file line cap; re-exported through it so
 * they stay on the `transactionsService` namespace.
 */
import { count } from 'drizzle-orm';

import { transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** A `{ description, checksum }` projection for in-memory rule-preview on the client. */
export interface DescriptionPreviewRow {
  description: string;
  checksum: string | null;
}

/** Result of {@link listDescriptionsForPreview}. */
export interface DescriptionPreviewResult {
  data: DescriptionPreviewRow[];
  total: number;
  truncated: boolean;
}

/**
 * Fetch up to `limit` `{ description, checksum }` rows for client-side rule
 * preview. Reads one extra row to detect truncation; `total` reflects the
 * real row count so the client can surface a "preview truncated" hint.
 */
export function listDescriptionsForPreview(db: FinanceDb, limit: number): DescriptionPreviewResult {
  const rows = db
    .select({ description: transactions.description, checksum: transactions.checksum })
    .from(transactions)
    .limit(limit + 1)
    .all();
  const truncated = rows.length > limit;
  const data = truncated ? rows.slice(0, limit) : rows;
  const totalRow = db.select({ total: count() }).from(transactions).all()[0];
  return { data, total: totalRow?.total ?? 0, truncated };
}

function addParsedTags(target: Set<string>, raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  for (const tag of parsed) if (typeof tag === 'string') target.add(tag);
}

/**
 * Distinct, sorted tag values across all transactions — for tag-editor
 * autocomplete. Reflects the JSON `tags` column; empty arrays are skipped.
 */
export function collectAvailableTags(db: FinanceDb): string[] {
  const rows = db.select({ tags: transactions.tags }).from(transactions).all();
  const tagSet = new Set<string>();
  for (const row of rows) {
    if (row.tags && row.tags !== '[]') addParsedTags(tagSet, row.tags);
  }
  return [...tagSet].toSorted();
}
