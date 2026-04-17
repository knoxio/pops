import crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { transformAnz } from './anz.js';

/**
 * Unit tests for ANZ CSV transformer.
 * All functions are pure (no external dependencies) and tested in isolation.
 */

describe('transformAnz', () => {
  it('transforms complete ANZ CSV row correctly', () => {
    const row = {
      Date: '07/04/2026',
      Amount: '-5000.00',
      Description: 'ANZ M-BANKING FUNDS TFER TRANSFER 685361  TO 4564XXXXXXXX7373',
    };
    const sortedRow = Object.fromEntries(
      Object.keys(row)
        .toSorted()
        .map((k) => [k, row[k as keyof typeof row]])
    );

    const result = transformAnz(row);

    expect(result.date).toBe('2026-04-07');
    expect(result.description).toBe('ANZ M-BANKING FUNDS TFER TRANSFER 685361 TO 4564XXXXXXXX7373');
    expect(result.amount).toBe(-5000);
    expect(result.account).toBe('ANZ Everyday');
    expect(result.location).toBeUndefined();
    expect(result.rawRow).toBe(JSON.stringify(sortedRow));
    expect(result.checksum).toBe(
      crypto.createHash('sha256').update(JSON.stringify(sortedRow)).digest('hex')
    );
  });

  it('preserves positive amount (income) without inversion', () => {
    const row = {
      Date: '07/04/2026',
      Amount: '5000.00',
      Description: 'PAYMENT FROM J SMITH',
    };

    const result = transformAnz(row);

    expect(result.amount).toBe(5000);
  });

  it('preserves negative amount (expense) without inversion', () => {
    const row = {
      Date: '07/04/2026',
      Amount: '-73.14',
      Description: 'PAYPAL *GITHUB INC',
    };

    const result = transformAnz(row);

    expect(result.amount).toBe(-73.14);
  });

  it('generates consistent checksum for same CSV row', () => {
    const row = {
      Date: '07/04/2026',
      Amount: '-50.00',
      Description: 'TEST',
    };

    const result1 = transformAnz(row);
    const result2 = transformAnz(row);

    expect(result1.checksum).toBe(result2.checksum);
    expect(result1.checksum).toHaveLength(64); // SHA-256 hex digest
  });

  it('generates different checksums for different rows', () => {
    const row1 = {
      Date: '07/04/2026',
      Amount: '-50.00',
      Description: 'TEST',
    };

    const row2 = {
      Date: '08/04/2026',
      Amount: '-50.00',
      Description: 'TEST',
    };

    const result1 = transformAnz(row1);
    const result2 = transformAnz(row2);

    expect(result1.checksum).not.toBe(result2.checksum);
  });

  it('checksum equals SHA-256 of rawRow', () => {
    const row = {
      Date: '07/04/2026',
      Amount: '-50.00',
      Description: 'TEST MERCHANT',
    };

    const result = transformAnz(row);

    const expected = crypto.createHash('sha256').update(result.rawRow).digest('hex');
    expect(result.checksum).toBe(expected);
  });

  it('uses Account field from row when present', () => {
    const row = {
      Date: '07/04/2026',
      Amount: '-50.00',
      Description: 'TEST',
      Account: 'ANZ Savings',
    };

    const result = transformAnz(row);

    expect(result.account).toBe('ANZ Savings');
  });

  it('defaults account to "ANZ Everyday" when Account field is absent', () => {
    const row = {
      Date: '07/04/2026',
      Amount: '-50.00',
      Description: 'TEST',
    };

    const result = transformAnz(row);

    expect(result.account).toBe('ANZ Everyday');
  });

  it('rawRow contains key-sorted JSON regardless of input key order', () => {
    const rowAbc = { Amount: '-50.00', Date: '07/04/2026', Description: 'TEST' };
    const rowZyx = { Description: 'TEST', Date: '07/04/2026', Amount: '-50.00' };

    const result1 = transformAnz(rowAbc);
    const result2 = transformAnz(rowZyx);

    expect(result1.rawRow).toBe(result2.rawRow);
    expect(result1.checksum).toBe(result2.checksum);
  });

  it('throws for invalid date format', () => {
    const row = {
      Date: '2026-04-07',
      Amount: '-50.00',
      Description: 'TEST',
    };

    expect(() => transformAnz(row)).toThrow('Invalid date format');
  });

  it('throws for invalid amount', () => {
    const row = {
      Date: '07/04/2026',
      Amount: 'not-a-number',
      Description: 'TEST',
    };

    expect(() => transformAnz(row)).toThrow('Invalid amount');
  });

  it('throws for empty amount', () => {
    const row = {
      Date: '07/04/2026',
      Amount: '',
      Description: 'TEST',
    };

    expect(() => transformAnz(row)).toThrow('Invalid amount');
  });
});

describe('transformAnz — normaliseDate', () => {
  it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00', Description: 'TEST' };
    expect(transformAnz(row).date).toBe('2026-04-07');
  });

  it('pads single-digit day', () => {
    const row = { Date: '1/04/2026', Amount: '-50.00', Description: 'TEST' };
    expect(transformAnz(row).date).toBe('2026-04-01');
  });

  it('pads single-digit month', () => {
    const row = { Date: '07/4/2026', Amount: '-50.00', Description: 'TEST' };
    expect(transformAnz(row).date).toBe('2026-04-07');
  });

  it('pads single-digit day and month', () => {
    const row = { Date: '1/2/2026', Amount: '-50.00', Description: 'TEST' };
    expect(transformAnz(row).date).toBe('2026-02-01');
  });

  it('handles leap year', () => {
    const row = { Date: '29/02/2024', Amount: '-50.00', Description: 'TEST' };
    expect(transformAnz(row).date).toBe('2024-02-29');
  });

  it('throws for wrong separator', () => {
    const row = { Date: '07-04-2026', Amount: '-50.00', Description: 'TEST' };
    expect(() => transformAnz(row)).toThrow('Invalid date format');
  });

  it('throws for empty string', () => {
    const row = { Date: '', Amount: '-50.00', Description: 'TEST' };
    expect(() => transformAnz(row)).toThrow('Invalid date format');
  });

  it('throws for too many parts', () => {
    const row = { Date: '07/04/2026/extra', Amount: '-50.00', Description: 'TEST' };
    expect(() => transformAnz(row)).toThrow('Invalid date format');
  });
});

describe('transformAnz — normaliseAmount', () => {
  it('keeps negative amount as-is (expense)', () => {
    const row = { Date: '07/04/2026', Amount: '-100.50', Description: 'TEST' };
    expect(transformAnz(row).amount).toBe(-100.5);
  });

  it('keeps positive amount as-is (income)', () => {
    const row = { Date: '07/04/2026', Amount: '2500.00', Description: 'SALARY' };
    expect(transformAnz(row).amount).toBe(2500);
  });

  it('handles zero', () => {
    const row = { Date: '07/04/2026', Amount: '0', Description: 'TEST' };
    expect(transformAnz(row).amount).toBe(0);
  });

  it('handles integer string', () => {
    const row = { Date: '07/04/2026', Amount: '-50', Description: 'TEST' };
    expect(transformAnz(row).amount).toBe(-50);
  });

  it('handles large amount', () => {
    const row = { Date: '07/04/2026', Amount: '-5000.00', Description: 'TEST' };
    expect(transformAnz(row).amount).toBe(-5000);
  });

  it('handles leading whitespace in amount', () => {
    const row = { Date: '07/04/2026', Amount: '  -50.00', Description: 'TEST' };
    expect(transformAnz(row).amount).toBe(-50);
  });

  it('handles trailing whitespace in amount', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00  ', Description: 'TEST' };
    expect(transformAnz(row).amount).toBe(-50);
  });

  it('throws for non-numeric string', () => {
    const row = { Date: '07/04/2026', Amount: 'abc', Description: 'TEST' };
    expect(() => transformAnz(row)).toThrow('Invalid amount');
  });

  it('throws for null-like undefined field', () => {
    const row: Record<string, unknown> = {
      Date: '07/04/2026',
      Description: 'TEST',
      Amount: undefined,
    };
    expect(() => transformAnz(row as Record<string, string>)).toThrow('Invalid amount');
  });
});

describe('transformAnz — cleanDescription', () => {
  it('removes double spaces', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00', Description: 'TRANSFER  685361' };
    expect(transformAnz(row).description).toBe('TRANSFER 685361');
  });

  it('removes multiple spaces (3+)', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00', Description: 'A   B    C' };
    expect(transformAnz(row).description).toBe('A B C');
  });

  it('trims leading whitespace', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00', Description: '  MERCHANT' };
    expect(transformAnz(row).description).toBe('MERCHANT');
  });

  it('trims trailing whitespace', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00', Description: 'MERCHANT  ' };
    expect(transformAnz(row).description).toBe('MERCHANT');
  });

  it('throws for empty description', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00', Description: '' };
    expect(() => transformAnz(row)).toThrow('empty Description');
  });

  it('preserves single spaces between words', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00', Description: 'ANZ M-BANKING FUNDS TFER' };
    expect(transformAnz(row).description).toBe('ANZ M-BANKING FUNDS TFER');
  });

  it('throws for whitespace-only description', () => {
    const row = { Date: '07/04/2026', Amount: '-50.00', Description: '   ' };
    expect(() => transformAnz(row)).toThrow('empty Description');
  });
});
