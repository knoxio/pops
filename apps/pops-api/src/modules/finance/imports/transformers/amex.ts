import { createHash } from 'crypto';

import type { ParsedTransaction } from '../types.js';

function normaliseDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  const [day, month, year] = parts;
  return `${year}-${(month ?? '').padStart(2, '0')}-${(day ?? '').padStart(2, '0')}`;
}

function normaliseAmount(amountStr: string): number {
  const amount = parseFloat(amountStr);
  if (isNaN(amount)) {
    throw new TypeError(`Invalid amount: ${amountStr}`);
  }
  return -amount;
}

function cleanDescription(description: string): string {
  return description.replaceAll(/\s{2,}/g, ' ').trim();
}

function extractLocation(townCity: string): string | undefined {
  if (!townCity) return undefined;
  const firstLine = (townCity.split('\n')[0] ?? '').trim();
  if (!firstLine) return undefined;
  return firstLine
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Transform Amex CSV row to ParsedTransaction
 *
 * Amex CSV columns:
 * - Date: DD/MM/YYYY
 * - Amount: Positive for charges (money out)
 * - Description: Merchant name
 * - Town/City: Multiline (e.g., "NORTH SYDNEY\nNSW")
 * - Country: Text
 * - Address: Multiline
 * - Postcode: Text
 */
export function transformAmex(row: Record<string, string>): ParsedTransaction {
  // Use key-sorted JSON for both rawRow and checksum so the checksum is the
  // SHA-256 of exactly what is stored — no ambiguity between the two fields.
  const sortedRow = Object.fromEntries(
    Object.keys(row)
      .toSorted()
      .map((k) => [k, row[k]])
  );
  const rawRow = JSON.stringify(sortedRow);
  const checksum = createHash('sha256').update(rawRow).digest('hex');
  const location = extractLocation(row['Town/City'] ?? '');

  return {
    date: normaliseDate(row['Date'] ?? ''),
    description: cleanDescription(row['Description'] ?? ''),
    amount: normaliseAmount(row['Amount'] ?? ''),
    account: 'Amex',
    location,
    rawRow,
    checksum,
  };
}
