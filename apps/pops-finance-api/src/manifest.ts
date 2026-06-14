/**
 * Finance pillar manifest payload (PRD-240 US-03).
 *
 * Declares the wire-format manifest that the finance pillar registers
 * with the central registry on boot. PRD-240 US-03 adds the
 * `settings.manifests` dimension — peer of `search.adapters`, `ai.tools`,
 * and `sinks` — so the settings UI contribution flows through the same
 * manifest payload as every other pillar dimension. The source for the
 * finance settings manifest lives in the contract package and is imported
 * from its `./settings` subpath (PRD-239 US-03 relocation).
 */
import { financeManifest } from '@pops/finance-contract/settings';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const FINANCE_PILLAR_ID = 'finance' as const;

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
    healthcheck: { path: '/health' },
  };
}
