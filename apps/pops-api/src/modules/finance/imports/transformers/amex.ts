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
 * Normalize amount - Amex amounts are positive for charges (money out)
 * We need to invert so negative = expense
 */
function normaliseAmount(amountStr: string): number {
  const amount = parseFloat(amountStr);
  if (isNaN(amount)) {
    throw new TypeError(`Invalid amount: ${amountStr}`);
  }
  // Invert: positive charges become negative expenses
  return -amount;
}

/**
 * Extract location from multiline Town/City field
 * Format: "NORTH SYDNEY\nNSW" → "North Sydney"
 */
function extractLocation(townCity: string): string | undefined {
  if (!townCity) return undefined;

  // Take first line and clean up
  const lines = townCity.split('\n');
  const town = (lines[0] ?? '').trim();

  if (!town) return undefined;

  // Title case the town name
  return town
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Clean merchant name from Amex description
 * Removes excessive whitespace
 */
function cleanDescription(description: string): string {
  return description.replaceAll(/\s{2,}/g, ' ').trim();
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
  // Store full row as JSON for audit trail and AI context
  const rawRow = JSON.stringify(row);

  // Generate checksum for reliable deduplication
  const checksum = crypto.createHash('sha256').update(rawRow).digest('hex');

  return {
    date: normaliseDate(row['Date'] ?? ''),
    description: cleanDescription(row['Description'] ?? ''),
    amount: normaliseAmount(row['Amount'] ?? ''),
    account: 'Amex',
    location: extractLocation(row['Town/City'] ?? ''),
    rawRow,
    checksum,
  };
}
