import { inArray } from 'drizzle-orm';

import { transactions } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';

/**
 * Query SQLite for existing checksums.
 * Returns set of checksums that already exist in the transactions table.
 */
export function findExistingChecksums(checksums: string[]): Set<string> {
  if (checksums.length === 0) return new Set();

  const db = getDrizzle();
  const existingChecksums = new Set<string>();

  // Query in batches of 500 to avoid SQLite variable limits
  for (let i = 0; i < checksums.length; i += 500) {
    const batch = checksums.slice(i, i + 500);
    const rows = db
      .select({ checksum: transactions.checksum })
      .from(transactions)
      .where(inArray(transactions.checksum, batch))
      .all();

    for (const row of rows) {
      if (row.checksum) existingChecksums.add(row.checksum);
    }
  }

  return existingChecksums;
}
