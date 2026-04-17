import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { parse } from 'csv-parse/sync';

type BufferEncoding =
  | 'ascii'
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'ucs2'
  | 'ucs-2'
  | 'base64'
  | 'latin1'
  | 'binary'
  | 'hex';

/** Generic CSV parsing with auto-detected headers. */
export function parseCsv<T extends Record<string, string>>(
  filePath: string,
  options?: {
    delimiter?: string;
    skipLines?: number;
    encoding?: BufferEncoding;
  }
): T[] {
  const content = readFileSync(filePath, options?.encoding ?? 'utf-8');

  return parse<T>(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: options?.delimiter ?? ',',
    from_line: (options?.skipLines ?? 0) + 1,
  });
}

/**
 * Normalise a date string to YYYY-MM-DD format.
 * Handles common Australian bank formats: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY.
 */
export function normaliseDate(raw: string): string {
  const trimmed = raw.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    if (day && month && year) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // DD MMM YYYY (e.g. "15 Jan 2026")
  const months: Record<string, string> = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  };
  const textMatch = trimmed.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (textMatch) {
    const [, day, monthAbbr, year] = textMatch;
    if (day && monthAbbr && year) {
      const monthNum = months[monthAbbr];
      if (monthNum) {
        return `${year}-${monthNum}-${day.padStart(2, '0')}`;
      }
    }
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error(`Cannot parse date: "${raw}"`);
}

/** Parse an amount string, handling parentheses for negatives and currency symbols. */
export function normaliseAmount(raw: string): number {
  let cleaned = raw.trim().replaceAll(/[$,]/g, '');

  // Parentheses mean negative: (100.00) -> -100.00
  const parenMatch = cleaned.match(/^\((.+)\)$/);
  if (parenMatch) {
    cleaned = `-${parenMatch[1]}`;
  }

  const amount = Number(cleaned);
  if (Number.isNaN(amount)) {
    throw new TypeError(`Cannot parse amount: "${raw}"`);
  }
  return amount;
}

/**
 * Extract a displayable location string from a multiline Town/City field.
 *
 * Amex CSV format: "NORTH SYDNEY\nNSW" → "North Sydney"
 * Takes the first non-empty line and title-cases it.
 *
 * @returns Title-cased first line, or `null` if the field is empty/whitespace-only.
 */
export function extractLocation(locationStr: string): string | null {
  if (!locationStr) return null;

  const firstLine = (locationStr.split('\n')[0] ?? '').trim();
  if (!firstLine) return null;

  return firstLine
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Detect whether a transaction is an online purchase based on common keywords
 * and domain patterns found in merchant descriptions.
 *
 * Matches (case-insensitive):
 * - Platform names: AMAZON, PAYPAL, EBAY, ETSY, ALIEXPRESS, SHOPIFY, STRIPE
 * - Streaming/digital: NETFLIX, SPOTIFY, APPLE.COM, GOOGLE, MICROSOFT
 * - Domain patterns: .COM.AU, .COM, .NET, .IO
 * - Explicit labels: ONLINE, INTERNET, DIGITAL, WEB, ECOMMERCE
 */
export function isOnlineTransaction(description: string): boolean {
  const upper = description.toUpperCase();

  const keywordPatterns: RegExp[] = [
    // Marketplace / payment platforms
    /\bAMAZON\b/,
    /\bPAYPAL\b/,
    /\bEBAY\b/,
    /\bETSY\b/,
    /\bALIEXPRESS\b/,
    /\bSHOPIFY\b/,
    /\bSTRIPE\b/,
    // Streaming / digital services
    /\bNETFLIX\b/,
    /\bSPOTIFY\b/,
    /\bAPPLE\.COM\b/,
    /\bAPPLE ITUNES\b/,
    /\bGOOGLE\b/,
    /\bMICROSOFT\b/,
    /\bSTEAM\b/,
    // Domain-like patterns (e.g. AMZN.COM.AU, XYZ.COM, FOO.NET)
    /\w+\.COM\.AU\b/,
    /\w+\.COM\b/,
    /\w+\.NET\b/,
    /\w+\.IO\b/,
    // Explicit labels
    /\bONLINE\b/,
    /\bINTERNET\b/,
    /\bDIGITAL\b/,
    /\bWEB\b/,
    /\bECOMMERCE\b/,
    /\bE-COMMERCE\b/,
  ];

  return keywordPatterns.some((pattern) => pattern.test(upper));
}

/**
 * Generate a deterministic SHA-256 checksum for a raw CSV row.
 *
 * Keys are sorted before serialisation to guarantee the same hash regardless
 * of property insertion order in the parsed object.
 *
 * @returns 64-character lowercase hex digest.
 */
export function generateRowChecksum(rawRow: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.keys(rawRow)
      .toSorted()
      .map((k) => [k, rawRow[k]])
  );
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}
