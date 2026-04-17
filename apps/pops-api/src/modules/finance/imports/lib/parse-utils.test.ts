import { createHash } from 'crypto';

import { describe, expect, it } from 'vitest';

import {
  extractLocation,
  generateChecksum,
  normaliseAmount,
  normaliseDate,
} from './parse-utils.js';

describe('normaliseDate', () => {
  it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
    expect(normaliseDate('13/02/2026')).toBe('2026-02-13');
  });

  it('pads single-digit day', () => {
    expect(normaliseDate('1/02/2026')).toBe('2026-02-01');
  });

  it('pads single-digit month', () => {
    expect(normaliseDate('13/2/2026')).toBe('2026-02-13');
  });

  it('pads both single-digit day and month', () => {
    expect(normaliseDate('1/2/2026')).toBe('2026-02-01');
  });

  it('handles leap year date', () => {
    expect(normaliseDate('29/02/2024')).toBe('2024-02-29');
  });

  it('handles end-of-year date', () => {
    expect(normaliseDate('31/12/2025')).toBe('2025-12-31');
  });

  it('throws for wrong separator (dashes)', () => {
    expect(() => normaliseDate('13-02-2026')).toThrow('Invalid date format');
  });

  it('throws for YYYY-MM-DD input (wrong format)', () => {
    expect(() => normaliseDate('2026-02-13')).toThrow('Invalid date format');
  });

  it('throws for too many parts', () => {
    expect(() => normaliseDate('13/02/2026/extra')).toThrow('Invalid date format');
  });

  it('throws for empty string', () => {
    expect(() => normaliseDate('')).toThrow('Invalid date format');
  });

  it('throws for completely malformed string', () => {
    expect(() => normaliseDate('not-a-date')).toThrow('Invalid date format');
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseDate('  13/02/2026  ')).toBe('2026-02-13');
  });

  it('throws for non-numeric parts', () => {
    expect(() => normaliseDate('aa/02/2026')).toThrow('Invalid date format');
  });
});

describe('normaliseAmount', () => {
  it('inverts positive amount to negative (debit / expense)', () => {
    expect(normaliseAmount('125.50')).toBe(-125.5);
  });

  it('inverts negative amount to positive (credit / refund)', () => {
    expect(normaliseAmount('-50.25')).toBe(50.25);
  });

  it('handles zero', () => {
    expect(normaliseAmount('0')).toBe(0);
  });

  it('handles integer string', () => {
    expect(normaliseAmount('100')).toBe(-100);
  });

  it('handles many decimal places', () => {
    expect(normaliseAmount('100.123456')).toBe(-100.123456);
  });

  it('handles very large amount', () => {
    expect(normaliseAmount('999999.99')).toBe(-999999.99);
  });

  it('handles leading whitespace', () => {
    expect(normaliseAmount('  100.00')).toBe(-100.0);
  });

  it('handles trailing whitespace', () => {
    expect(normaliseAmount('100.00  ')).toBe(-100.0);
  });

  it('throws for non-numeric string', () => {
    expect(() => normaliseAmount('abc')).toThrow('Invalid amount');
  });

  it('throws for empty string', () => {
    expect(() => normaliseAmount('')).toThrow('Invalid amount');
  });

  it('throws for null coerced to string "null"', () => {
    expect(() => normaliseAmount('null')).toThrow('Invalid amount');
  });

  it('throws for undefined coerced to string "undefined"', () => {
    expect(() => normaliseAmount('undefined')).toThrow('Invalid amount');
  });

  it('throws for partial numeric string', () => {
    expect(() => normaliseAmount('100abc')).toThrow('Invalid amount');
  });
});

describe('extractLocation', () => {
  it('returns undefined for empty string', () => {
    expect(extractLocation('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(extractLocation('   ')).toBeUndefined();
  });

  it('returns undefined when first line is empty (leading newline)', () => {
    expect(extractLocation('\nSYDNEY')).toBeUndefined();
  });

  it('returns undefined for only newlines', () => {
    expect(extractLocation('\n\n')).toBeUndefined();
  });

  it('title-cases single all-caps word', () => {
    expect(extractLocation('SYDNEY')).toBe('Sydney');
  });

  it('title-cases multi-word all-caps', () => {
    expect(extractLocation('NORTH SYDNEY')).toBe('North Sydney');
  });

  it('title-cases mixed-case input', () => {
    expect(extractLocation('nOrTh SyDnEy')).toBe('North Sydney');
  });

  it('uses only the first line of a multiline string', () => {
    expect(extractLocation('NORTH SYDNEY\nNSW')).toBe('North Sydney');
  });

  it('uses only the first line of three-line input', () => {
    expect(extractLocation('SYDNEY\nNSW\nAUSTRALIA')).toBe('Sydney');
  });

  it('preserves numbers in location', () => {
    expect(extractLocation('SYDNEY 2000')).toBe('Sydney 2000');
  });

  it('trims whitespace from the first line', () => {
    expect(extractLocation('  SYDNEY  ')).toBe('Sydney');
  });

  it('handles single lowercase word', () => {
    expect(extractLocation('sydney')).toBe('Sydney');
  });
});

describe('generateChecksum', () => {
  it('returns a 64-character hex string for checksum', () => {
    const { checksum } = generateChecksum({ Date: '2026-01-15', Amount: '100.00' });
    expect(checksum).toHaveLength(64);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rawRow is a JSON string', () => {
    const { rawRow } = generateChecksum({ Date: '2026-01-15', Amount: '100.00' });
    expect(() => JSON.parse(rawRow)).not.toThrow();
  });

  it('rawRow uses key-sorted keys', () => {
    const row = { Z: 'last', A: 'first', M: 'middle' };
    const { rawRow } = generateChecksum(row);
    const parsed = JSON.parse(rawRow) as Record<string, string>;
    expect(Object.keys(parsed)).toEqual(['A', 'M', 'Z']);
  });

  it('checksum matches SHA-256 of the key-sorted rawRow', () => {
    const row = { Description: 'TEST', Amount: '50.00', Date: '2026-03-01' };
    const { rawRow, checksum } = generateChecksum(row);
    const expected = createHash('sha256').update(rawRow).digest('hex');
    expect(checksum).toBe(expected);
  });

  it('is deterministic for the same input', () => {
    const row = { Date: '2026-01-15', Amount: '100.00', Description: 'MERCHANT' };
    const r1 = generateChecksum(row);
    const r2 = generateChecksum(row);
    expect(r1.checksum).toBe(r2.checksum);
    expect(r1.rawRow).toBe(r2.rawRow);
  });

  it('produces different checksums for different rows', () => {
    const { checksum: c1 } = generateChecksum({ Date: '2026-01-15', Amount: '100.00' });
    const { checksum: c2 } = generateChecksum({ Date: '2026-01-16', Amount: '100.00' });
    expect(c1).not.toBe(c2);
  });

  it('is independent of key insertion order', () => {
    const r1 = generateChecksum({ Amount: '100.00', Date: '2026-01-15' });
    const r2 = generateChecksum({ Date: '2026-01-15', Amount: '100.00' });
    expect(r1.checksum).toBe(r2.checksum);
    expect(r1.rawRow).toBe(r2.rawRow);
  });

  it('handles a row with many keys', () => {
    const row = {
      Date: '13/02/2026',
      Amount: '125.50',
      Description: 'WOOLWORTHS',
      'Town/City': 'SYDNEY\nNSW',
      Country: 'AUSTRALIA',
      Address: '123 MAIN ST',
      Postcode: '2000',
    };
    const { checksum } = generateChecksum(row);
    expect(checksum).toHaveLength(64);
  });

  it('handles empty row', () => {
    const { rawRow, checksum } = generateChecksum({});
    expect(rawRow).toBe('{}');
    expect(checksum).toHaveLength(64);
  });
});
