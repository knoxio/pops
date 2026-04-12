import type Database from 'better-sqlite3';

import type { ParsedTransaction } from './types.js';

/**
 * Date + amount count-based deduplication against existing SQLite records.
 *
 * For a given date and amount, counts how many records already exist in
 * the transactions table. If the import batch has more of that (date, amount)
 * pair than the database, the extras are new and should be imported.
 */
export function findNewTransactions(
  db: Database.Database,
  transactions: ParsedTransaction[],
  account: string
): ParsedTransaction[] {
  // Group transactions by (date, amount) tuple
  const groups = new Map<string, ParsedTransaction[]>();
  for (const txn of transactions) {
    const key = `${txn.date}|${txn.amount}`;
    const group = groups.get(key) ?? [];
    group.push(txn);
    groups.set(key, group);
  }

  const stmt = db.prepare(
    'SELECT COUNT(*) as count FROM transactions WHERE date = ? AND amount = ? AND account = ?'
  );

  const newTransactions: ParsedTransaction[] = [];

  for (const [key, batch] of groups) {
    const [date, amountStr] = key.split('|');
    if (!date || !amountStr) continue;
    const amount = Number(amountStr);

    const row = stmt.get(date, amount, account) as { count: number };
    const existingCount = row.count;
    const newCount = batch.length - existingCount;

    if (newCount > 0) {
      // Take the last N as the new ones
      newTransactions.push(...batch.slice(-newCount));
    }
  }

  return newTransactions;
}
