import { describe, expect, it } from 'vitest';

import { normaliseAmount, normaliseDate } from './csv-parser.js';

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
