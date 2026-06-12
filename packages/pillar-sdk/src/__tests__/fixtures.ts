import type { ManifestPayload } from '../manifest-schema/schema.js';

export function validManifest(): ManifestPayload {
  return {
    pillar: 'finance',
    version: '1.2.3',
    contract: {
      package: '@pops/finance-contract',
      version: '1.2.3',
      tag: 'contract-finance@v1.2.3',
    },
    routes: {
      queries: ['finance.transactions.list', 'finance.budgets.get'],
      mutations: ['finance.transactions.create'],
      subscriptions: [],
    },
    search: {
      adapters: ['transactionsAdapter', 'budgetsAdapter'],
    },
    ai: {
      tools: [
        {
          name: 'createTransaction',
          description: 'Create a new transaction in the finance ledger.',
          parameters: { type: 'object' },
        },
      ],
    },
    uri: {
      types: ['finance/transaction', 'finance/budget'],
    },
    settings: {
      keys: ['finance.defaultCurrency', 'finance.locale'],
    },
    healthcheck: {
      path: '/healthz',
    },
  };
}
