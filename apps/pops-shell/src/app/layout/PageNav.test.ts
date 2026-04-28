import { findActiveApp, isPageActive } from '@/app/nav/path-utils';
/**
 * Tests for PageNav helper functions
 */
import { describe, expect, it } from 'vitest';

import type { AppNavConfig } from '@/app/nav/types';

const mockApps: AppNavConfig[] = [
  {
    id: 'finance',
    label: 'Finance',
    labelKey: 'finance',
    icon: 'DollarSign',
    basePath: '/finance',
    items: [
      { path: '', label: 'Dashboard', labelKey: 'finance.dashboard', icon: 'LayoutDashboard' },
      {
        path: '/transactions',
        label: 'Transactions',
        labelKey: 'finance.transactions',
        icon: 'CreditCard',
      },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    labelKey: 'media',
    icon: 'Film',
    basePath: '/media',
    items: [
      { path: '', label: 'Library', labelKey: 'media.library', icon: 'Film' },
      { path: '/watchlist', label: 'Watchlist', labelKey: 'media.watchlist', icon: 'Star' },
    ],
  },
];

describe('findActiveApp', () => {
  it('returns the app matching the pathname', () => {
    expect(findActiveApp('/finance/transactions', mockApps)?.id).toBe('finance');
    expect(findActiveApp('/media/watchlist', mockApps)?.id).toBe('media');
  });

  it('matches app root path', () => {
    expect(findActiveApp('/finance', mockApps)?.id).toBe('finance');
    expect(findActiveApp('/finance/', mockApps)?.id).toBe('finance');
  });

  it('returns undefined for unknown paths', () => {
    expect(findActiveApp('/settings', mockApps)).toBeUndefined();
    expect(findActiveApp('/', mockApps)).toBeUndefined();
  });

  it('does not match prefix collisions', () => {
    expect(findActiveApp('/fin', mockApps)).toBeUndefined();
    expect(findActiveApp('/finances', mockApps)).toBeUndefined();
    expect(findActiveApp('/media-player', mockApps)).toBeUndefined();
  });
});

describe('isPageActive', () => {
  it('matches index page on exact basePath', () => {
    expect(isPageActive('/finance', '/finance', '')).toBe(true);
    expect(isPageActive('/finance/', '/finance', '')).toBe(true);
  });

  it('does not match index page on sub-path', () => {
    expect(isPageActive('/finance/transactions', '/finance', '')).toBe(false);
  });

  it('matches sub-page by prefix', () => {
    expect(isPageActive('/finance/transactions', '/finance', '/transactions')).toBe(true);
  });

  it('matches sub-page with deeper path', () => {
    expect(isPageActive('/finance/transactions/123', '/finance', '/transactions')).toBe(true);
  });

  it('does not match unrelated page', () => {
    expect(isPageActive('/finance/budgets', '/finance', '/transactions')).toBe(false);
  });

  it('does not match prefix collisions on sub-pages', () => {
    expect(isPageActive('/finance/transactions-pending', '/finance', '/transactions')).toBe(false);
  });
});
