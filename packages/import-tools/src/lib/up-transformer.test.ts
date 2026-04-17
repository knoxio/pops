import crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { transformUpTransaction } from './up-transformer.js';

import type { UpTransaction } from './up-client.js';

function makeUpTransaction(overrides: Partial<UpTransaction> = {}): UpTransaction {
  return {
    id: 'txn-uuid-abc123',
    description: 'WOOLWORTHS',
    rawText: 'WOOLWORTHS 1234',
    amount: -45.6,
    settledAt: '2026-01-15T12:00:00+10:00',
    accountId: 'account-uuid-001',
    ...overrides,
  };
}

describe('transformUpTransaction', () => {
  it('maps description correctly', () => {
    const tx = makeUpTransaction({ description: 'COLES SUPERMARKET' });
    const result = transformUpTransaction(tx, 'Up Everyday');
    expect(result.description).toBe('COLES SUPERMARKET');
  });

  it('trims whitespace from description', () => {
    const tx = makeUpTransaction({ description: '  UBER EATS  ' });
    const result = transformUpTransaction(tx, 'Up Everyday');
    expect(result.description).toBe('UBER EATS');
  });

  it('maps amount correctly for expenses (negative)', () => {
    const tx = makeUpTransaction({ amount: -45.6 });
    const result = transformUpTransaction(tx, 'Up Everyday');
    expect(result.amount).toBe(-45.6);
  });

  it('maps amount correctly for income (positive)', () => {
    const tx = makeUpTransaction({ amount: 1500.0 });
    const result = transformUpTransaction(tx, 'Up Savings');
    expect(result.amount).toBe(1500.0);
  });

  it('extracts date as YYYY-MM-DD from settledAt', () => {
    const tx = makeUpTransaction({ settledAt: '2026-01-15T12:00:00+10:00' });
    const result = transformUpTransaction(tx, 'Up Everyday');
    expect(result.date).toBe('2026-01-15');
  });

  it('extracts date correctly when settledAt spans midnight boundaries', () => {
    const tx = makeUpTransaction({ settledAt: '2025-12-31T23:59:59+10:00' });
    const result = transformUpTransaction(tx, 'Up Everyday');
    expect(result.date).toBe('2025-12-31');
  });

  it('maps account to the provided account name', () => {
    const tx = makeUpTransaction();
    const result = transformUpTransaction(tx, 'Up Savers');
    expect(result.account).toBe('Up Savers');
  });

  it('checksum is stable for the same transaction ID', () => {
    const tx = makeUpTransaction({ id: 'txn-stable-id' });
    const r1 = transformUpTransaction(tx, 'Up Everyday');
    const r2 = transformUpTransaction(tx, 'Up Everyday');
    expect(r1.checksum).toBe(r2.checksum);
  });

  it('checksum differs for different transaction IDs', () => {
    const r1 = transformUpTransaction(makeUpTransaction({ id: 'id-alpha' }), 'Up Everyday');
    const r2 = transformUpTransaction(makeUpTransaction({ id: 'id-beta' }), 'Up Everyday');
    expect(r1.checksum).not.toBe(r2.checksum);
  });

  it('checksum matches SHA-256 of the transaction ID', () => {
    const tx = makeUpTransaction({ id: 'txn-verify-checksum' });
    const result = transformUpTransaction(tx, 'Up Everyday');
    const expected = crypto.createHash('sha256').update('txn-verify-checksum').digest('hex');
    expect(result.checksum).toBe(expected);
  });

  it('rawRow is valid JSON', () => {
    const tx = makeUpTransaction();
    const result = transformUpTransaction(tx, 'Up Everyday');
    expect(() => JSON.parse(result.rawRow ?? '')).not.toThrow();
  });

  it('rawRow contains the transaction ID', () => {
    const tx = makeUpTransaction({ id: 'raw-row-id-check' });
    const result = transformUpTransaction(tx, 'Up Everyday');
    const parsed = JSON.parse(result.rawRow ?? '{}') as Record<string, unknown>;
    expect(parsed['id']).toBe('raw-row-id-check');
  });

  it('rawRow contains description, amount, and settledAt', () => {
    const tx = makeUpTransaction({
      description: 'CALTEX PETROL',
      amount: -80.0,
      settledAt: '2026-03-01T09:00:00+10:00',
    });
    const result = transformUpTransaction(tx, 'Up Everyday');
    const parsed = JSON.parse(result.rawRow ?? '{}') as Record<string, unknown>;
    expect(parsed['description']).toBe('CALTEX PETROL');
    expect(parsed['amount']).toBe(-80.0);
    expect(parsed['settledAt']).toBe('2026-03-01T09:00:00+10:00');
  });
});
