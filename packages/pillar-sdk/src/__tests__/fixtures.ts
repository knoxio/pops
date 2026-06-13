import type { ManifestPayload } from '../manifest-schema/schema.js';

function validAdapters(): ManifestPayload['search']['adapters'] {
  return [
    {
      name: 'transactionsAdapter',
      entityType: 'transaction',
      queryShape: {
        supportsText: true,
        supportsTags: true,
        supportsDateRange: true,
        supportsScope: ['accountId'],
      },
      procedurePath: 'finance.transactions.search',
    },
    {
      name: 'budgetsAdapter',
      entityType: 'budget',
      queryShape: {
        supportsText: true,
        supportsTags: false,
        supportsDateRange: false,
        supportsScope: [],
      },
      procedurePath: 'finance.budgets.search',
      rankFieldName: 'updatedAt',
    },
  ];
}

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
      queries: [
        'finance.transactions.list',
        'finance.transactions.search',
        'finance.budgets.get',
        'finance.budgets.search',
      ],
      mutations: ['finance.transactions.create'],
      subscriptions: [],
    },
    search: { adapters: validAdapters() },
    ai: {
      tools: [
        {
          name: 'createTransaction',
          description: 'Create a new transaction in the finance ledger.',
          parameters: { type: 'object' },
        },
      ],
    },
    uri: { types: ['finance/transaction', 'finance/budget'] },
    settings: { keys: ['finance.defaultCurrency', 'finance.locale'] },
    healthcheck: { path: '/healthz' },
  };
}
