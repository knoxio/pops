import { createHash } from 'crypto';

/**
 * Shared parsing utilities for bank CSV transformers.
 *
 * All parsers (Amex, ANZ, ING, Up Bank) call these utilities
 * instead of reimplementing the same transformations.
 */

/**
 * Normalise a date from DD/MM/YYYY to YYYY-MM-DD.
 *
 * @throws {Error} if the input does not match DD/MM/YYYY with numeric parts.
 */
export function normaliseDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  const [day, month, year] = trimmed.split('/');
  return `${year}-${(month ?? '').padStart(2, '0')}-${(day ?? '').padStart(2, '0')}`;
}

/**
 * Normalise an amount string to a signed number.
 *
 * Sign convention: positive input → negative output (debit/expense),
 * negative input → positive output (credit/refund). This matches Amex
 * where charges are positive in the CSV and must be stored as negatives.
 *
 * @throws {TypeError} if the string cannot be parsed as a number.
 */
export function normaliseAmount(amountStr: string): number {
  const trimmed = amountStr.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new TypeError(`Invalid amount: ${amountStr}`);
  }
  const amount = Number(trimmed);
  return amount === 0 ? 0 : -amount;
}

/**
 * Extract a displayable location from a multiline Town/City field.
 *
 * Amex CSV format: "NORTH SYDNEY\nNSW" → "North Sydney"
 *
 * Takes the first non-empty line and title-cases each word.
 *
 * @returns Title-cased first line, or `undefined` if the field is empty or
 * whitespace-only.
 */
export function extractLocation(townCity: string): string | undefined {
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
 * Generate a stable checksum for a raw CSV row.
 *
 * Keys are sorted before JSON serialisation so the checksum is independent
 * of the order in which a CSV parser yields them.
 *
 * @returns An object containing:
 *   - `rawRow`: the key-sorted JSON string (stored for audit / AI context)
 *   - `checksum`: SHA-256 hex digest of `rawRow`
 */
export function generateChecksum(row: Record<string, string>): {
  rawRow: string;
  checksum: string;
} {
  const sortedRow = Object.fromEntries(
    Object.keys(row)
      .toSorted()
      .map((k) => [k, row[k]])
  );
  const rawRow = JSON.stringify(sortedRow);
  const checksum = createHash('sha256').update(rawRow).digest('hex');
  return { rawRow, checksum };
}
