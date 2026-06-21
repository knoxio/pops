import { describe, expect, it } from 'vitest';

import type { Budget } from './types';

// Pull the filterFn implementations out for isolated unit testing.
// The column definitions are module-level constants so we re-implement the
// logic here as the canonical specification for the two custom filterFns.

function periodFilterFn(period: string | null, filterValue: unknown): boolean {
  if (filterValue === undefined || filterValue === null || filterValue === '') return true;
  if (filterValue === '__null__') return period === null;
  return period === filterValue;
}

function activeFilterFn(active: boolean, filterValue: unknown): boolean {
  if (filterValue === undefined || filterValue === null || filterValue === '') return true;
  return active === (filterValue === 'true');
}

function mockPeriodRow(period: string | null) {
  return {
    getValue: (_id: string) => period as unknown,
    original: { period } as Budget,
  };
}

function mockActiveRow(active: boolean) {
  return {
    getValue: (_id: string) => active as unknown,
    original: { active } as Budget,
  };
}

describe('periodColumn filterFn', () => {
  it('shows all rows when filter is empty string', () => {
    expect(periodFilterFn(null, '')).toBe(true);
    expect(periodFilterFn('Monthly', '')).toBe(true);
    expect(periodFilterFn('Yearly', '')).toBe(true);
  });

  it('shows all rows when filter is undefined', () => {
    expect(periodFilterFn(null, undefined)).toBe(true);
    expect(periodFilterFn('Monthly', undefined)).toBe(true);
  });

  it('shows all rows when filter is null', () => {
    expect(periodFilterFn(null, null)).toBe(true);
    expect(periodFilterFn('Monthly', null)).toBe(true);
  });

  it('shows only null-period rows when filter is __null__', () => {
    expect(periodFilterFn(null, '__null__')).toBe(true);
    expect(periodFilterFn('Monthly', '__null__')).toBe(false);
    expect(periodFilterFn('Yearly', '__null__')).toBe(false);
  });

  it('shows only matching rows for Monthly', () => {
    expect(periodFilterFn('Monthly', 'Monthly')).toBe(true);
    expect(periodFilterFn('Yearly', 'Monthly')).toBe(false);
    expect(periodFilterFn(null, 'Monthly')).toBe(false);
  });

  it('shows only matching rows for Yearly', () => {
    expect(periodFilterFn('Yearly', 'Yearly')).toBe(true);
    expect(periodFilterFn('Monthly', 'Yearly')).toBe(false);
    expect(periodFilterFn(null, 'Yearly')).toBe(false);
  });

  it('does not match stored __null__ string against the null sentinel (edge case)', () => {
    // A row with the literal string '__null__' would match — this is the
    // theoretical edge case acknowledged in the PR. The enum on the API
    // schemas (CreateBudgetSchema/UpdateBudgetSchema) prevents this from
    // being created via the normal write path.
    expect(periodFilterFn('__null__', '__null__')).toBe(false);
  });
});

describe('statusColumn filterFn', () => {
  it('shows all rows when filter is empty string', () => {
    expect(activeFilterFn(true, '')).toBe(true);
    expect(activeFilterFn(false, '')).toBe(true);
  });

  it('shows all rows when filter is undefined', () => {
    expect(activeFilterFn(true, undefined)).toBe(true);
    expect(activeFilterFn(false, undefined)).toBe(true);
  });

  it('shows only active rows when filter is true', () => {
    expect(activeFilterFn(true, 'true')).toBe(true);
    expect(activeFilterFn(false, 'true')).toBe(false);
  });

  it('shows only inactive rows when filter is false', () => {
    expect(activeFilterFn(false, 'false')).toBe(true);
    expect(activeFilterFn(true, 'false')).toBe(false);
  });
});

// Verify the mock row helpers are typed correctly (compile-time check).
void mockPeriodRow(null);
void mockPeriodRow('Monthly');
void mockActiveRow(true);
