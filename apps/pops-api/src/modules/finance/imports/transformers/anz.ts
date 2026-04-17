import crypto from 'crypto';

import type { ParsedTransaction } from '../types.js';

/**
 * Normalize date from DD/MM/YYYY to YYYY-MM-DD
 */
function normaliseDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  const [day, month, year] = parts;
  return `${year}-${(month ?? '').padStart(2, '0')}-${(day ?? '').padStart(2, '0')}`;
}

/**
 * Normalize amount — ANZ uses correct sign convention already.
 * Expenses are negative, income is positive. No inversion needed.
 */
function normaliseAmount(amountStr: string): number {
  const amount = parseFloat(amountStr);
  if (isNaN(amount)) {
    throw new TypeError(`Invalid amount: ${amountStr}`);
  }
  return amount;
}

/**
 * Clean whitespace from description field
 */
function cleanDescription(description: string): string {
  return description.replaceAll(/\s{2,}/g, ' ').trim();
}

/**
 * Transform ANZ CSV row to ParsedTransaction.
 *
 * ANZ CSV columns (no header row — callers must assign these key names):
 * - Date:        DD/MM/YYYY
 * - Amount:      Signed float — expenses already negative, income positive
 * - Description: Merchant / transfer description
 *
 * Account defaults to "ANZ Everyday" when not present in the row.
 *
 * The checksum is a SHA-256 of the key-sorted JSON representation of the row
 * (rawRow), so checksum == SHA-256(rawRow) holds deterministically regardless
 * of the key insertion order in the input object.
 */
export function transformAnz(row: Record<string, string>): ParsedTransaction {
  const description = cleanDescription(row['Description'] ?? '');
  if (!description) {
    throw new Error('Row has an empty Description');
  }

  // Key-sort the row so rawRow and checksum are stable regardless of CSV column order
  const sortedRow = Object.fromEntries(
    Object.keys(row)
      .toSorted()
      .map((k) => [k, row[k] ?? ''])
  );

  // Store full row as JSON for audit trail and AI context
  const rawRow = JSON.stringify(sortedRow);

  // Generate checksum for reliable deduplication
  const checksum = crypto.createHash('sha256').update(rawRow).digest('hex');

  return {
    date: normaliseDate(row['Date'] ?? ''),
    description,
    amount: normaliseAmount(row['Amount'] ?? ''),
    account: row['Account'] ?? 'ANZ Everyday',
    rawRow,
    checksum,
  };
}
