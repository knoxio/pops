import { and, isNotNull, ne } from 'drizzle-orm';

import { transactions as transactionsTable } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';

function parseTagsColumn(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim());
  } catch {
    return [];
  }
}

export function loadAvailableTagsFromDb(): string[] {
  try {
    const rows = getDrizzle()
      .select({ tags: transactionsTable.tags })
      .from(transactionsTable)
      .where(and(isNotNull(transactionsTable.tags), ne(transactionsTable.tags, '[]')))
      .all();

    const tagSet = new Set<string>();
    for (const row of rows) {
      for (const tag of parseTagsColumn(row.tags)) tagSet.add(tag);
    }
    return [...tagSet].toSorted();
  } catch {
    return [];
  }
}
