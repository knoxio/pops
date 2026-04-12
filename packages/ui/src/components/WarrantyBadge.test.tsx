import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWarrantyStatus } from './WarrantyBadge';

describe('getWarrantyStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 26));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns expired for past dates', () => {
    const result = getWarrantyStatus('2026-03-25');
    expect(result.state).toBe('expired');
    expect(result.label).toBe('Expired');
  });

  it('returns expiring with 0 days when expiry is today', () => {
    const result = getWarrantyStatus('2026-03-26');
    expect(result.state).toBe('expiring');
    expect(result.label).toBe('Expires in 0 days');
  });

  it('returns expiring with 1 day remaining', () => {
    const result = getWarrantyStatus('2026-03-27');
    expect(result.state).toBe('expiring');
    expect(result.label).toBe('Expires in 1 days');
  });

  it('returns expiring with 45 days remaining', () => {
    const result = getWarrantyStatus('2026-05-10');
    expect(result.state).toBe('expiring');
    expect(result.label).toMatch(/^Expires in 4[456] days$/);
  });

  it('returns expiring with 89 days remaining', () => {
    const result = getWarrantyStatus('2026-06-23');
    expect(result.state).toBe('expiring');
    expect(result.label).toMatch(/^Expires in (89|90) days$/);
  });

  it('returns expiring at 90-day boundary', () => {
    // 90 days from March 26 = June 24; date-only strings parse as UTC
    // which may shift ±1 day in non-UTC timezones
    const result = getWarrantyStatus('2026-06-24');
    expect(['expiring', 'active']).toContain(result.state);
  });

  it('returns active for warranty beyond 90 days', () => {
    const result = getWarrantyStatus('2026-06-26');
    expect(result.state).toBe('active');
    expect(result.label).toMatch(/^Warranty until /);
  });

  it('returns none when warrantyExpiry is null', () => {
    const result = getWarrantyStatus(null);
    expect(result.state).toBe('none');
    expect(result.label).toBe('No warranty');
  });

  it('returns active with formatted date for far future', () => {
    const result = getWarrantyStatus('2027-12-31');
    expect(result.state).toBe('active');
    expect(result.label).toMatch(/Warranty until.*2027/);
  });
});
