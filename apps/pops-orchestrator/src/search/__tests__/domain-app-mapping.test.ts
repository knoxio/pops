import { describe, expect, it } from 'vitest';

import { getDomainApp, isContextDomain } from '../domain-app-mapping.js';

describe('getDomainApp', () => {
  it('maps pillar-level section domains to their app', () => {
    expect(getDomainApp('finance')).toBe('finance');
    expect(getDomainApp('inventory')).toBe('inventory');
    expect(getDomainApp('core')).toBe('core');
  });

  it('keeps the monolith fine-grained adapter domains mapped', () => {
    expect(getDomainApp('transactions')).toBe('finance');
    expect(getDomainApp('budgets')).toBe('finance');
    expect(getDomainApp('entities')).toBe('core');
    expect(getDomainApp('inventory-items')).toBe('inventory');
  });

  it('returns null for an unknown domain', () => {
    expect(getDomainApp('weather')).toBeNull();
  });
});

describe('isContextDomain', () => {
  it('is true when the pillar domain belongs to the current app', () => {
    expect(isContextDomain('finance', 'finance')).toBe(true);
    expect(isContextDomain('transactions', 'finance')).toBe(true);
  });

  it('is false when the domain belongs to a different app', () => {
    expect(isContextDomain('finance', 'inventory')).toBe(false);
    expect(isContextDomain('transactions', 'media')).toBe(false);
  });

  it('is false for an unknown domain', () => {
    expect(isContextDomain('weather', 'finance')).toBe(false);
  });
});
