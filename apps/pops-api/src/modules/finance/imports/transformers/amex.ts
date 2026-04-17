import {
  extractLocation,
  generateChecksum,
  normaliseAmount,
  normaliseDate,
} from '../lib/parse-utils.js';

import type { ParsedTransaction } from '../types.js';

/**
 * Clean merchant name from Amex description.
 * Collapses runs of whitespace (including tabs/newlines) to a single space.
 */
function cleanDescription(description: string): string {
  return description.replaceAll(/\s{2,}/g, ' ').trim();
}

/**
 * Transform an Amex CSV row to ParsedTransaction.
 *
 * Amex CSV columns:
 * - Date:        DD/MM/YYYY
 * - Amount:      Positive for charges (money out) — inverted by normaliseAmount
 * - Description: Merchant name (may have extra whitespace)
 * - Town/City:   Multiline (e.g., "NORTH SYDNEY\nNSW")
 * - Country:     Text
 * - Address:     Multiline
 * - Postcode:    Text
 */
export function transformAmex(row: Record<string, string>): ParsedTransaction {
  const { rawRow, checksum } = generateChecksum(row);

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
