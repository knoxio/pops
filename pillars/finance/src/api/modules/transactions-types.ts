/**
 * Wire mapper for the transactions domain. The zod schemas now live in
 * the REST contract (`src/contract/rest-transactions.ts`); this file
 * keeps only the row → response projection and its TS shape.
 */
import type { TransactionRow } from '../../db/index.js';

/** API response shape (camelCase). */
export interface Transaction {
  id: string;
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country: string | null;
  relatedTransactionId: string | null;
  notes: string | null;
  lastEditedTime: string;
}

function parseTagsJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

/** Map a SQLite row to the API response shape. */
export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    description: row.description,
    account: row.account,
    amount: row.amount,
    date: row.date,
    type: row.type,
    tags: parseTagsJson(row.tags),
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    country: row.country,
    relatedTransactionId: row.relatedTransactionId,
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
  };
}
