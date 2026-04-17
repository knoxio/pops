import crypto from 'crypto';

import type { ParsedTransaction } from './types.js';
import type { UpTransaction } from './up-client.js';

/**
 * Transform a single Up Bank API transaction into a ParsedTransaction.
 *
 * - `date`        : YYYY-MM-DD extracted from `settledAt`
 * - `description` : `tx.description`, trimmed
 * - `amount`      : already a signed number (negative = expense)
 * - `account`     : display name resolved from the account map
 * - `rawRow`      : JSON snapshot of key fields for audit trail
 * - `checksum`    : SHA-256 of the Up transaction ID — stable per-transaction
 *
 * @param tx          - Normalised Up Bank transaction
 * @param accountName - Display name for the owning account (e.g. "Up Everyday")
 */
export function transformUpTransaction(tx: UpTransaction, accountName: string): ParsedTransaction {
  // settledAt is an ISO 8601 string; take just the date portion (YYYY-MM-DD)
  const date = tx.settledAt.slice(0, 10);

  const description = tx.description.trim();

  const rawRow = JSON.stringify({
    id: tx.id,
    description: tx.description,
    amount: tx.amount,
    settledAt: tx.settledAt,
  });

  const checksum = crypto.createHash('sha256').update(tx.id).digest('hex');

  return {
    date,
    description,
    amount: tx.amount,
    account: accountName,
    rawRow,
    checksum,
  };
}
