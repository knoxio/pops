import { describe, expect, it } from 'vitest';

import { buildPageSubtitle } from './page-subtitle';

// Minimal translate stub that returns the key so we can assert on the
// key and interpolation values without pulling in i18next.
function makeT(captured: { key: string; opts?: Record<string, unknown> }) {
  return (key: string, opts?: Record<string, unknown>) => {
    captured.key = key;
    captured.opts = opts;
    return key;
  };
}

describe('buildPageSubtitle', () => {
  it('uses the totalKey when filteredCount is null (data not yet loaded)', () => {
    const captured = { key: '' };
    buildPageSubtitle({
      t: makeT(captured),
      totalKey: 'transactions.totalCount',
      filteredKey: 'transactions.filteredCount',
      total: 16,
      filteredCount: null,
    });
    expect(captured.key).toBe('transactions.totalCount');
    expect(captured.opts).toEqual({ count: 16 });
  });

  it('uses the totalKey when filteredCount equals total (no active filter)', () => {
    const captured = { key: '' };
    buildPageSubtitle({
      t: makeT(captured),
      totalKey: 'transactions.totalCount',
      filteredKey: 'transactions.filteredCount',
      total: 16,
      filteredCount: 16,
    });
    expect(captured.key).toBe('transactions.totalCount');
    expect(captured.opts).toEqual({ count: 16 });
  });

  it('uses the filteredKey when filteredCount is less than total', () => {
    const captured = { key: '' };
    buildPageSubtitle({
      t: makeT(captured),
      totalKey: 'transactions.totalCount',
      filteredKey: 'transactions.filteredCount',
      total: 16,
      filteredCount: 2,
    });
    expect(captured.key).toBe('transactions.filteredCount');
    expect(captured.opts).toEqual({ filtered: 2, total: 16 });
  });

  it('uses the filteredKey when filteredCount is 0 (no rows match the filter)', () => {
    const captured = { key: '' };
    buildPageSubtitle({
      t: makeT(captured),
      totalKey: 'budgets.totalCount',
      filteredKey: 'budgets.filteredCount',
      total: 8,
      filteredCount: 0,
    });
    expect(captured.key).toBe('budgets.filteredCount');
    expect(captured.opts).toEqual({ filtered: 0, total: 8 });
  });

  it('uses the totalKey when total is 0 and filteredCount is 0', () => {
    const captured = { key: '' };
    buildPageSubtitle({
      t: makeT(captured),
      totalKey: 'entities.totalCount',
      filteredKey: 'entities.filteredCount',
      total: 0,
      filteredCount: 0,
    });
    expect(captured.key).toBe('entities.totalCount');
    expect(captured.opts).toEqual({ count: 0 });
  });

  it('returns the translated string from the t function', () => {
    const result = buildPageSubtitle({
      t: (key) => `translated:${key}`,
      totalKey: 'wishlist.totalCount',
      filteredKey: 'wishlist.filteredCount',
      total: 5,
      filteredCount: 5,
    });
    expect(result).toBe('translated:wishlist.totalCount');
  });

  it('returns the translated filtered string from the t function', () => {
    const result = buildPageSubtitle({
      t: (key) => `translated:${key}`,
      totalKey: 'wishlist.totalCount',
      filteredKey: 'wishlist.filteredCount',
      total: 5,
      filteredCount: 3,
    });
    expect(result).toBe('translated:wishlist.filteredCount');
  });
});
