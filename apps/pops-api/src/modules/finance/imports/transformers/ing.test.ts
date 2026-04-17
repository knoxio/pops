import crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { transformIng } from './ing.js';

/**
 * Unit tests for ING CSV transformer.
 * All functions are pure (no external dependencies) and tested in isolation.
 */

describe('transformIng', () => {
  it('transforms a debit row correctly', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'To my account - Internal Transfer',
      Credit: '',
      Debit: '8.00',
      Balance: '987.09',
    };
    const sortedRow = Object.fromEntries(
      Object.keys(row)
        .toSorted()
        .map((k) => [k, row[k as keyof typeof row]])
    );

    const result = transformIng(row);

    expect(result.date).toBe('2026-04-10');
    expect(result.description).toBe('To my account - Internal Transfer');
    expect(result.amount).toBe(-8);
    expect(result.account).toBe('ING Savings');
    expect(result.location).toBeUndefined();
    expect(result.rawRow).toBe(JSON.stringify(sortedRow));
    expect(result.checksum).toBe(
      crypto.createHash('sha256').update(JSON.stringify(sortedRow)).digest('hex')
    );
  });

  it('transforms a credit row correctly', () => {
    const row = {
      Date: '02/04/2026',
      Description: 'Loan repayment - Osko Payment',
      Credit: '650.00',
      Debit: '',
      Balance: '995.09',
    };

    const result = transformIng(row);

    expect(result.date).toBe('2026-04-02');
    expect(result.description).toBe('Loan repayment - Osko Payment');
    expect(result.amount).toBe(650);
    expect(result.account).toBe('ING Savings');
  });

  it('generates consistent checksum for same CSV row', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '',
      Debit: '50.00',
      Balance: '100.00',
    };

    const result1 = transformIng(row);
    const result2 = transformIng(row);

    expect(result1.checksum).toBe(result2.checksum);
    expect(result1.checksum).toHaveLength(64); // SHA-256 hex digest
  });

  it('generates different checksums for different rows', () => {
    const row1 = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '',
      Debit: '50.00',
      Balance: '100.00',
    };

    const row2 = {
      Date: '11/04/2026',
      Description: 'TEST',
      Credit: '',
      Debit: '50.00',
      Balance: '50.00',
    };

    const result1 = transformIng(row1);
    const result2 = transformIng(row2);

    expect(result1.checksum).not.toBe(result2.checksum);
  });

  it('checksum equals SHA-256 of rawRow', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST MERCHANT',
      Credit: '100.00',
      Debit: '',
      Balance: '500.00',
    };

    const result = transformIng(row);

    const expected = crypto.createHash('sha256').update(result.rawRow).digest('hex');
    expect(result.checksum).toBe(expected);
  });

  it('rawRow contains key-sorted JSON regardless of input key order', () => {
    const rowAbc = {
      Balance: '100.00',
      Credit: '50.00',
      Date: '10/04/2026',
      Debit: '',
      Description: 'TEST',
    };
    const rowZyx = {
      Description: 'TEST',
      Debit: '',
      Date: '10/04/2026',
      Credit: '50.00',
      Balance: '100.00',
    };

    const result1 = transformIng(rowAbc);
    const result2 = transformIng(rowZyx);

    expect(result1.rawRow).toBe(result2.rawRow);
    expect(result1.checksum).toBe(result2.checksum);
  });

  it('account is always "ING Savings"', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '100.00',
      Debit: '',
      Balance: '500.00',
    };

    expect(transformIng(row).account).toBe('ING Savings');
  });

  it('throws for invalid date format', () => {
    const row = {
      Date: '2026-04-10',
      Description: 'TEST',
      Credit: '100.00',
      Debit: '',
      Balance: '500.00',
    };

    expect(() => transformIng(row)).toThrow('Invalid date format');
  });

  it('throws when both Credit and Debit are populated', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '100.00',
      Debit: '50.00',
      Balance: '500.00',
    };

    expect(() => transformIng(row)).toThrow('both Credit and Debit');
  });

  it('throws when both Credit and Debit are empty', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '',
      Debit: '',
      Balance: '500.00',
    };

    expect(() => transformIng(row)).toThrow('no Credit or Debit value');
  });

  it('throws for invalid credit amount', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: 'not-a-number',
      Debit: '',
      Balance: '500.00',
    };

    expect(() => transformIng(row)).toThrow('Invalid credit amount');
  });

  it('throws for invalid debit amount', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '',
      Debit: 'not-a-number',
      Balance: '500.00',
    };

    expect(() => transformIng(row)).toThrow('Invalid debit amount');
  });
});

describe('transformIng — normaliseDate', () => {
  it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '50.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).date).toBe('2026-04-10');
  });

  it('pads single-digit day', () => {
    const row = { Date: '1/04/2026', Description: 'TEST', Credit: '50.00', Debit: '', Balance: '' };
    expect(transformIng(row).date).toBe('2026-04-01');
  });

  it('pads single-digit month', () => {
    const row = { Date: '10/4/2026', Description: 'TEST', Credit: '50.00', Debit: '', Balance: '' };
    expect(transformIng(row).date).toBe('2026-04-10');
  });

  it('pads single-digit day and month', () => {
    const row = { Date: '1/2/2026', Description: 'TEST', Credit: '50.00', Debit: '', Balance: '' };
    expect(transformIng(row).date).toBe('2026-02-01');
  });

  it('handles leap year', () => {
    const row = {
      Date: '29/02/2024',
      Description: 'TEST',
      Credit: '50.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).date).toBe('2024-02-29');
  });

  it('throws for wrong separator', () => {
    const row = {
      Date: '10-04-2026',
      Description: 'TEST',
      Credit: '50.00',
      Debit: '',
      Balance: '',
    };
    expect(() => transformIng(row)).toThrow('Invalid date format');
  });

  it('throws for empty string', () => {
    const row = { Date: '', Description: 'TEST', Credit: '50.00', Debit: '', Balance: '' };
    expect(() => transformIng(row)).toThrow('Invalid date format');
  });

  it('throws for too many parts', () => {
    const row = {
      Date: '10/04/2026/extra',
      Description: 'TEST',
      Credit: '50.00',
      Debit: '',
      Balance: '',
    };
    expect(() => transformIng(row)).toThrow('Invalid date format');
  });
});

describe('transformIng — normaliseAmount (Credit/Debit)', () => {
  it('returns positive amount for credit', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '650.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(650);
  });

  it('returns negative amount for debit', () => {
    const row = { Date: '10/04/2026', Description: 'TEST', Credit: '', Debit: '8.00', Balance: '' };
    expect(transformIng(row).amount).toBe(-8);
  });

  it('handles large debit', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '',
      Debit: '8000.00',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(-8000);
  });

  it('handles large credit', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '20000.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(20000);
  });

  it('handles credit with decimal places', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '85.50',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(85.5);
  });

  it('handles debit with decimal places', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '',
      Debit: '497.78',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(-497.78);
  });

  it('handles credit with whitespace padding', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '  650.00  ',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(650);
  });

  it('handles debit with whitespace padding', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '',
      Debit: '  8.00  ',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(-8);
  });

  it('treats whitespace-only credit as empty (uses debit)', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '   ',
      Debit: '8.00',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(-8);
  });

  it('treats whitespace-only debit as empty (uses credit)', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '650.00',
      Debit: '   ',
      Balance: '',
    };
    expect(transformIng(row).amount).toBe(650);
  });

  it('throws when both credit and debit are non-empty', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'TEST',
      Credit: '100.00',
      Debit: '50.00',
      Balance: '',
    };
    expect(() => transformIng(row)).toThrow('both Credit and Debit');
  });

  it('throws when both are empty', () => {
    const row = { Date: '10/04/2026', Description: 'TEST', Credit: '', Debit: '', Balance: '' };
    expect(() => transformIng(row)).toThrow('no Credit or Debit value');
  });

  it('throws for non-numeric credit', () => {
    const row = { Date: '10/04/2026', Description: 'TEST', Credit: 'abc', Debit: '', Balance: '' };
    expect(() => transformIng(row)).toThrow('Invalid credit amount');
  });

  it('throws for non-numeric debit', () => {
    const row = { Date: '10/04/2026', Description: 'TEST', Credit: '', Debit: 'xyz', Balance: '' };
    expect(() => transformIng(row)).toThrow('Invalid debit amount');
  });
});

describe('transformIng — cleanDescription', () => {
  it('removes double spaces', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'LOAN  REPAYMENT',
      Credit: '650.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).description).toBe('LOAN REPAYMENT');
  });

  it('removes multiple spaces (3+)', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'A   B    C',
      Credit: '50.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).description).toBe('A B C');
  });

  it('trims leading whitespace', () => {
    const row = {
      Date: '10/04/2026',
      Description: '  MERCHANT',
      Credit: '50.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).description).toBe('MERCHANT');
  });

  it('trims trailing whitespace', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'MERCHANT  ',
      Credit: '50.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).description).toBe('MERCHANT');
  });

  it('throws for empty description', () => {
    const row = { Date: '10/04/2026', Description: '', Credit: '50.00', Debit: '', Balance: '' };
    expect(() => transformIng(row)).toThrow('empty Description');
  });

  it('preserves single spaces between words', () => {
    const row = {
      Date: '10/04/2026',
      Description: 'To my account Internal Transfer',
      Credit: '50.00',
      Debit: '',
      Balance: '',
    };
    expect(transformIng(row).description).toBe('To my account Internal Transfer');
  });

  it('throws for whitespace-only description', () => {
    const row = { Date: '10/04/2026', Description: '   ', Credit: '50.00', Debit: '', Balance: '' };
    expect(() => transformIng(row)).toThrow('empty Description');
  });
});
