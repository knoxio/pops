import { findActiveApp, findActiveItem } from '@/app/nav/path-utils';
/**
 * Tests for PageNav helper functions
 */
import { describe, expect, it } from 'vitest';

import type { AppNavConfig, AppNavItem } from '@/app/nav/types';

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

const aiAdminItems: AppNavItem[] = [
  { path: '', label: 'AI Usage', labelKey: 'ai.usage', icon: 'BarChart3' },
  { path: '/prompts', label: 'Prompts', labelKey: 'ai.promptTemplates', icon: 'FileText' },
  { path: '/rules', label: 'Rules', labelKey: 'ai.rules', icon: 'BookOpen' },
  { path: '/cache', label: 'Cache', labelKey: 'ai.cache', icon: 'Database' },
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

describe('findActiveItem', () => {
  const financeApp = mockApps[0]!;
  const financeItems = financeApp.items;

  it('returns the index item on exact basePath', () => {
    expect(findActiveItem('/finance', '/finance', financeItems)?.path).toBe('');
    expect(findActiveItem('/finance/', '/finance', financeItems)?.path).toBe('');
  });

  it('returns the sub-page item when pathname is under it', () => {
    expect(findActiveItem('/finance/transactions', '/finance', financeItems)?.path).toBe(
      '/transactions'
    );
  });

  it('returns the sub-page item for nested paths', () => {
    expect(findActiveItem('/finance/transactions/123', '/finance', financeItems)?.path).toBe(
      '/transactions'
    );
  });

  it('does not return index item when on a sub-page', () => {
    expect(findActiveItem('/finance/transactions', '/finance', financeItems)?.path).not.toBe('');
  });

  it('returns undefined for unrelated paths', () => {
    expect(findActiveItem('/finance/budgets', '/finance', financeItems)).toBeUndefined();
  });

  it('rejects prefix collisions on sub-pages', () => {
    expect(
      findActiveItem('/finance/transactions-pending', '/finance', financeItems)
    ).toBeUndefined();
  });

  // This is the bug reported in #2620: navigating to /ai/prompts highlights
  // both `''` (AI Usage) AND `/prompts` because both match by prefix. Now
  // longest-match wins and only `/prompts` is active.
  it('picks the longest matching sibling — fixes #2620 double-highlight', () => {
    expect(findActiveItem('/ai/prompts', '/ai', aiAdminItems)?.path).toBe('/prompts');
    expect(findActiveItem('/ai/rules', '/ai', aiAdminItems)?.path).toBe('/rules');
    expect(findActiveItem('/ai/cache', '/ai', aiAdminItems)?.path).toBe('/cache');
    expect(findActiveItem('/ai', '/ai', aiAdminItems)?.path).toBe('');
  });

  it('returns index item for app root even when sub-page siblings exist', () => {
    expect(findActiveItem('/ai/', '/ai', aiAdminItems)?.path).toBe('');
  });
});
