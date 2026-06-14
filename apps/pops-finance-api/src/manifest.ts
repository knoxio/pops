/**
 * Finance pillar manifest payload (PRD-240 US-03, PRD-243 US-02).
 *
 * Declares the wire-format manifest that the finance pillar registers
 * with the central registry on boot. PRD-240 US-03 added the
 * `settings.manifests` dimension; PRD-243 US-02 adds the `nav` +
 * `pages` UI dimensions so the shell can derive the finance app-rail
 * entry and route surface from the registry walk instead of a static
 * `@pops/app-finance` import. The source values match
 * `packages/app-finance/src/routes.tsx` verbatim (icons translated to
 * the kebab-case wire form required by `NavConfigDescriptorSchema`).
 */
import { financeManifest } from '@pops/finance-contract/settings';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const FINANCE_PILLAR_ID = 'finance' as const;

const FINANCE_NAV: NavConfigDescriptor = {
  id: 'finance',
  label: 'Finance',
  labelKey: 'finance',
  icon: 'dollar-sign',
  color: 'emerald',
  basePath: '/finance',
  order: 10,
  items: [
    { path: '', label: 'Dashboard', labelKey: 'finance.dashboard', icon: 'layout-dashboard' },
    {
      path: '/transactions',
      label: 'Transactions',
      labelKey: 'finance.transactions',
      icon: 'credit-card',
    },
    { path: '/entities', label: 'Entities', labelKey: 'finance.entities', icon: 'building-2' },
    { path: '/budgets', label: 'Budgets', labelKey: 'finance.budgets', icon: 'piggy-bank' },
    { path: '/wishlist', label: 'Wish List', labelKey: 'finance.wishList', icon: 'star' },
    { path: '/import', label: 'Import', labelKey: 'finance.import', icon: 'download' },
    { path: '/rules', label: 'Rules', labelKey: 'finance.rules', icon: 'book-open' },
    {
      path: '/prompts',
      label: 'Prompt Templates',
      labelKey: 'finance.promptTemplates',
      icon: 'file-text',
    },
  ],
};

const FINANCE_PAGES: PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'finance-dashboard' },
  { path: 'transactions', bundleSlot: 'finance-transactions' },
  { path: 'entities', bundleSlot: 'finance-entities' },
  { path: 'budgets', bundleSlot: 'finance-budgets' },
  { path: 'wishlist', bundleSlot: 'finance-wishlist' },
  { path: 'import', bundleSlot: 'finance-import' },
  { path: 'rules', bundleSlot: 'finance-rules' },
  { path: 'prompts', bundleSlot: 'finance-prompts' },
];

export function buildFinanceManifest(version: string): ManifestPayload {
  return {
    pillar: FINANCE_PILLAR_ID,
    version,
    contract: {
      package: '@pops/finance-contract',
      version,
      tag: `contract-finance@v${version}`,
    },
    routes: {
      queries: [
        'finance.wishlist.list',
        'finance.wishlist.get',
        'finance.budgets.list',
        'finance.budgets.get',
        'finance.transactions.list',
        'finance.transactions.get',
      ],
      mutations: [
        'finance.wishlist.create',
        'finance.wishlist.update',
        'finance.wishlist.delete',
        'finance.budgets.create',
        'finance.budgets.update',
        'finance.budgets.delete',
        'finance.transactions.create',
        'finance.transactions.update',
        'finance.transactions.delete',
        'finance.transactions.restore',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['finance/transaction', 'finance/wishlist-item', 'finance/budget'] },
    consumedSettings: { keys: [] },
    settings: { manifests: [financeManifest] },
    nav: FINANCE_NAV,
    pages: FINANCE_PAGES,
    healthcheck: { path: '/health' },
  };
}
