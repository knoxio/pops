import { describe, expect, it } from 'vitest';

import { getDomainApp, isContextDomain } from './domain-app-mapping.js';

describe('getDomainApp', () => {
  it('maps movies to media', () => {
    expect(getDomainApp('movies')).toBe('media');
  });

  it('maps tv-shows to media', () => {
    expect(getDomainApp('tv-shows')).toBe('media');
  });

  it('maps transactions to finance', () => {
    expect(getDomainApp('transactions')).toBe('finance');
  });

  it('maps entities to finance', () => {
    expect(getDomainApp('entities')).toBe('finance');
  });

  it('maps budgets to finance', () => {
    expect(getDomainApp('budgets')).toBe('finance');
  });

  it('maps inventory-items to inventory', () => {
    expect(getDomainApp('inventory-items')).toBe('inventory');
  });

  it('returns null for unknown domain', () => {
    expect(getDomainApp('unknown')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getDomainApp('')).toBeNull();
  });
});

describe('isContextDomain', () => {
  it('returns true when domain belongs to the current app', () => {
    expect(isContextDomain('movies', 'media')).toBe(true);
    expect(isContextDomain('tv-shows', 'media')).toBe(true);
    expect(isContextDomain('transactions', 'finance')).toBe(true);
    expect(isContextDomain('entities', 'finance')).toBe(true);
    expect(isContextDomain('budgets', 'finance')).toBe(true);
    expect(isContextDomain('inventory-items', 'inventory')).toBe(true);
  });

  it('returns false when domain belongs to a different app', () => {
    expect(isContextDomain('movies', 'finance')).toBe(false);
    expect(isContextDomain('transactions', 'media')).toBe(false);
    expect(isContextDomain('inventory-items', 'finance')).toBe(false);
  });

  it('returns false for unknown domain', () => {
    expect(isContextDomain('unknown', 'media')).toBe(false);
    expect(isContextDomain('unknown', 'finance')).toBe(false);
  });
});
