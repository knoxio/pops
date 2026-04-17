import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  extractLocation,
  generateRowChecksum,
  isOnlineTransaction,
  normaliseAmount,
  normaliseDate,
} from './csv-parser.js';

describe('normaliseDate', () => {
  it('should parse DD/MM/YYYY format', () => {
    expect(normaliseDate('15/01/2026')).toBe('2026-01-15');
    expect(normaliseDate('1/3/2026')).toBe('2026-03-01');
  });

  it('should parse DD-MM-YYYY format', () => {
    expect(normaliseDate('15-01-2026')).toBe('2026-01-15');
    expect(normaliseDate('1-3-2026')).toBe('2026-03-01');
  });

  it('should parse DD MMM YYYY format', () => {
    expect(normaliseDate('15 Jan 2026')).toBe('2026-01-15');
    expect(normaliseDate('1 Mar 2026')).toBe('2026-03-01');
    expect(normaliseDate('31 Dec 2025')).toBe('2025-12-31');
  });

  it('should accept already formatted YYYY-MM-DD dates', () => {
    expect(normaliseDate('2026-01-15')).toBe('2026-01-15');
  });

  it('should throw on invalid date format', () => {
    expect(() => normaliseDate('invalid')).toThrow('Cannot parse date');
    expect(() => normaliseDate('2026/01/15')).toThrow('Cannot parse date');
  });
});

describe('normaliseAmount', () => {
  it('should parse positive amounts', () => {
    expect(normaliseAmount('100.00')).toBe(100.0);
    expect(normaliseAmount('1234.56')).toBe(1234.56);
  });

  it('should parse negative amounts', () => {
    expect(normaliseAmount('-100.00')).toBe(-100.0);
    expect(normaliseAmount('-1234.56')).toBe(-1234.56);
  });

  it('should parse amounts with currency symbols', () => {
    expect(normaliseAmount('$100.00')).toBe(100.0);
    expect(normaliseAmount('$1,234.56')).toBe(1234.56);
  });

  it('should parse amounts in parentheses as negative', () => {
    expect(normaliseAmount('(100.00)')).toBe(-100.0);
    expect(normaliseAmount('($1,234.56)')).toBe(-1234.56);
  });

  it('should remove commas from amounts', () => {
    expect(normaliseAmount('1,000,000.00')).toBe(1000000.0);
  });

  it('should throw on invalid amount', () => {
    expect(() => normaliseAmount('invalid')).toThrow('Cannot parse amount');
    expect(() => normaliseAmount('abc123')).toThrow('Cannot parse amount');
  });
});

describe('extractLocation', () => {
  it('returns null for empty string', () => {
    expect(extractLocation('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(extractLocation('   ')).toBeNull();
  });

  it('returns null when first line is empty', () => {
    expect(extractLocation('\nSYDNEY')).toBeNull();
  });

  it('title-cases all-caps single word', () => {
    expect(extractLocation('SYDNEY')).toBe('Sydney');
  });

  it('title-cases all-caps multi-word', () => {
    expect(extractLocation('NORTH SYDNEY')).toBe('North Sydney');
  });

  it('title-cases mixed-case input', () => {
    expect(extractLocation('nOrTh SyDnEy')).toBe('North Sydney');
  });

  it('uses only the first line of a multiline string', () => {
    expect(extractLocation('NORTH SYDNEY\nNSW')).toBe('North Sydney');
    expect(extractLocation('SYDNEY\nNSW\nAUSTRALIA')).toBe('Sydney');
  });

  it('preserves numbers in the location', () => {
    expect(extractLocation('SYDNEY 2000')).toBe('Sydney 2000');
  });
});

describe('isOnlineTransaction', () => {
  it('returns true for AMAZON', () => {
    expect(isOnlineTransaction('AMAZON AU MARKETPLACE')).toBe(true);
  });

  it('returns true for PAYPAL', () => {
    expect(isOnlineTransaction('PAYPAL *MERCHANT')).toBe(true);
  });

  it('returns true for EBAY', () => {
    expect(isOnlineTransaction('EBAY PURCHASE')).toBe(true);
  });

  it('returns true for .COM.AU domain pattern', () => {
    expect(isOnlineTransaction('CATCH.COM.AU')).toBe(true);
  });

  it('returns true for .COM domain pattern', () => {
    expect(isOnlineTransaction('AMZN.COM')).toBe(true);
  });

  it('returns true for explicit ONLINE keyword', () => {
    expect(isOnlineTransaction('WOOLWORTHS ONLINE')).toBe(true);
  });

  it('returns true for NETFLIX', () => {
    expect(isOnlineTransaction('NETFLIX.COM')).toBe(true);
  });

  it('returns true for SPOTIFY', () => {
    expect(isOnlineTransaction('SPOTIFY SUBSCRIPTION')).toBe(true);
  });

  it('returns true for GOOGLE', () => {
    expect(isOnlineTransaction('GOOGLE *STORAGE')).toBe(true);
  });

  it('returns false for a plain in-store merchant', () => {
    expect(isOnlineTransaction('WOOLWORTHS 1234 SYDNEY')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isOnlineTransaction('')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isOnlineTransaction('amazon marketplace')).toBe(true);
    expect(isOnlineTransaction('paypal purchase')).toBe(true);
  });
});

describe('generateRowChecksum', () => {
  it('returns a 64-character hex string', () => {
    const result = generateRowChecksum({ Date: '2026-01-15', Amount: '100.00' });
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const row = { Date: '2026-01-15', Amount: '100.00', Description: 'MERCHANT' };
    expect(generateRowChecksum(row)).toBe(generateRowChecksum(row));
  });

  it('produces different hashes for different rows', () => {
    const row1 = { Date: '2026-01-15', Amount: '100.00' };
    const row2 = { Date: '2026-01-16', Amount: '100.00' };
    expect(generateRowChecksum(row1)).not.toBe(generateRowChecksum(row2));
  });

  it('is independent of object key insertion order', () => {
    const row1 = { Amount: '100.00', Date: '2026-01-15' };
    const row2 = { Date: '2026-01-15', Amount: '100.00' };
    expect(generateRowChecksum(row1)).toBe(generateRowChecksum(row2));
  });

  it('matches a manual SHA-256 of key-sorted JSON', () => {
    const row = { Description: 'TEST', Amount: '50.00', Date: '2026-03-01' };
    const sorted = { Amount: '50.00', Date: '2026-03-01', Description: 'TEST' };
    const expected = createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
    expect(generateRowChecksum(row)).toBe(expected);
  });
});
