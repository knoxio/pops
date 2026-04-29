import { describe, expect, it } from 'vitest';

import { computeStats, signedColor } from './StatsGrid';

import type { Transaction } from '@pops/api/modules/finance/transactions/types';

function makeTx(amount: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${amount}`,
    date: '2026-04-29',
    description: 'Test',
    amount,
    accountId: 'acc-1',
    accountName: 'Test',
    type: amount >= 0 ? 'income' : 'purchase',
    entityId: null,
    entityName: null,
    tags: [],
    location: null,
    createdAt: '2026-04-29T00:00:00Z',
    updatedAt: '2026-04-29T00:00:00Z',
    ...overrides,
  } as Transaction;
}

describe('signedColor', () => {
  it('maps positive amounts to emerald', () => {
    expect(signedColor(0.01)).toBe('emerald');
    expect(signedColor(1234.56)).toBe('emerald');
  });

  it('maps negative amounts to rose', () => {
    expect(signedColor(-0.01)).toBe('rose');
    expect(signedColor(-1234.56)).toBe('rose');
  });

  it('maps zero to slate (neutral)', () => {
    expect(signedColor(0)).toBe('slate');
    expect(signedColor(-0)).toBe('slate');
  });
});

describe('computeStats', () => {
  it('returns null when transactions are undefined', () => {
    expect(computeStats(undefined, 0)).toBeNull();
  });

  it('returns zeroed stats for an empty transaction list', () => {
    expect(computeStats([], 0)).toEqual({
      totalTransactions: 0,
      totalIncome: 0,
      totalExpenses: 0,
    });
  });

  it('sums income (positive) and expenses (abs of negative) separately', () => {
    const stats = computeStats([makeTx(100), makeTx(-30), makeTx(50), makeTx(-20)], 4);
    expect(stats).toEqual({
      totalTransactions: 4,
      totalIncome: 150,
      totalExpenses: 50,
    });
  });

  it('uses the provided total count rather than the array length', () => {
    const stats = computeStats([makeTx(10)], 999);
    expect(stats?.totalTransactions).toBe(999);
  });
});
