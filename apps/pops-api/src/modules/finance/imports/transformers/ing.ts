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
 * Combine ING Credit and Debit columns into a single signed amount.
 *
 * ING CSV has two amount columns:
 * - Credit: positive value when money arrives (income/refund), empty otherwise
 * - Debit:  positive value when money leaves (expense), empty otherwise
 *
 * Returns a signed float: credits positive, debits negative.
 * Throws if neither or both columns have a parseable value.
 */
function normaliseAmount(creditStr: string, debitStr: string): number {
  const creditTrimmed = creditStr.trim();
  const debitTrimmed = debitStr.trim();

  const hasCredit = creditTrimmed !== '';
  const hasDebit = debitTrimmed !== '';

  if (hasCredit && hasDebit) {
    throw new Error(
      `Row has both Credit and Debit values: Credit="${creditStr}" Debit="${debitStr}"`
    );
  }

  if (hasCredit) {
    const amount = parseFloat(creditTrimmed);
    if (isNaN(amount)) {
      throw new TypeError(`Invalid credit amount: ${creditStr}`);
    }
    return amount;
  }

  if (hasDebit) {
    const amount = parseFloat(debitTrimmed);
    if (isNaN(amount)) {
      throw new TypeError(`Invalid debit amount: ${debitStr}`);
    }
    return -amount;
  }

  throw new Error(`Row has no Credit or Debit value`);
}

/**
 * Clean whitespace from description field
 */
function cleanDescription(description: string): string {
  return description.replaceAll(/\s{2,}/g, ' ').trim();
}

/**
 * Transform ING CSV row to ParsedTransaction.
 *
 * ING CSV columns:
 * - Date:        DD/MM/YYYY
 * - Description: Merchant / transfer description
 * - Credit:      Positive float when money received; empty otherwise
 * - Debit:       Positive float when money spent; empty otherwise
 * - Balance:     Running balance (ignored)
 *
 * Account is hardcoded to "ING Savings".
 *
 * The checksum is a SHA-256 of the key-sorted JSON representation of the row
 * (rawRow), so checksum == SHA-256(rawRow) holds deterministically.
 */
export function transformIng(row: Record<string, string>): ParsedTransaction {
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
    amount: normaliseAmount(row['Credit'] ?? '', row['Debit'] ?? ''),
    account: 'ING Savings',
    rawRow,
    checksum,
  };
}
