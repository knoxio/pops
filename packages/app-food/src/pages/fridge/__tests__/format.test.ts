/**
 * Unit tests for the fridge display formatters.
 */
import { describe, expect, it } from 'vitest';

import { formatExpiry, formatQty, urgencyFor } from '../format.js';

describe('formatQty', () => {
  it('formats >=1000g as kg', () => {
    expect(formatQty(1200, 'g')).toBe('1.2 kg');
    expect(formatQty(1000, 'g')).toBe('1 kg');
  });
  it('formats <1000g as g', () => {
    expect(formatQty(200, 'g')).toBe('200 g');
  });
  it('formats ml at >=1000 as L', () => {
    expect(formatQty(1500, 'ml')).toBe('1.5 L');
  });
  it('formats count', () => {
    expect(formatQty(3, 'count')).toBe('3 ct');
    expect(formatQty(2.5, 'count')).toBe('2.5 ct');
  });
});

describe('formatExpiry', () => {
  it('returns em-dash for null expiry', () => {
    expect(formatExpiry(null, null)).toBe('—');
  });
  it('describes future expiry in days', () => {
    expect(formatExpiry('2026-06-15T00:00:00.000Z', 5)).toContain('in 5d');
  });
  it('describes past expiry', () => {
    expect(formatExpiry('2026-06-05T00:00:00.000Z', -3)).toContain('expired 3d ago');
  });
  it('says today for zero', () => {
    expect(formatExpiry('2026-06-10T00:00:00.000Z', 0)).toContain('(today)');
  });
});

describe('urgencyFor', () => {
  it('unknown for null', () => {
    expect(urgencyFor(null)).toBe('unknown');
  });
  it('expired for negative', () => {
    expect(urgencyFor(-1)).toBe('expired');
  });
  it('soon for 0..3', () => {
    expect(urgencyFor(0)).toBe('soon');
    expect(urgencyFor(3)).toBe('soon');
  });
  it('normal for >3', () => {
    expect(urgencyFor(4)).toBe('normal');
  });
});
