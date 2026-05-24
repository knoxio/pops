import { getClient } from '../client.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from './index.js';

const ENTITY_TYPES = [
  'company',
  'person',
  'government',
  'bank',
  'place',
  'brand',
  'organisation',
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

const transactionsList: ToolDef = {
  name: 'finance.transactions.list',
  description:
    'List financial transactions. Filter by date range, entity, account, type, or free-text search.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search in transaction description' },
      startDate: { type: 'string', description: 'Start date (ISO 8601, e.g. "2025-01-01")' },
      endDate: { type: 'string', description: 'End date (ISO 8601, e.g. "2025-12-31")' },
      entityId: { type: 'string', description: 'Filter by entity (merchant) ID' },
      account: { type: 'string', description: 'Filter by account name' },
      type: {
        type: 'string',
        enum: ['income', 'expense', 'transfer'],
        description: 'Transaction type',
      },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await getClient().finance.transactions.list.query({
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      startDate: typeof args['startDate'] === 'string' ? args['startDate'] : undefined,
      endDate: typeof args['endDate'] === 'string' ? args['endDate'] : undefined,
      entityId: typeof args['entityId'] === 'string' ? args['entityId'] : undefined,
      account: typeof args['account'] === 'string' ? args['account'] : undefined,
      type:
        args['type'] === 'income' || args['type'] === 'expense' || args['type'] === 'transfer'
          ? args['type']
          : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return ok(result);
  },
};

const entitiesList: ToolDef = {
  name: 'finance.entities.list',
  description:
    'List finance entities (merchants, businesses). Entities are matched to transactions during import.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search by entity name' },
      type: { type: 'string', description: 'Filter by entity type' },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await getClient().core.entities.list.query({
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      type: (ENTITY_TYPES as readonly string[]).includes(args['type'] as string)
        ? (args['type'] as EntityType)
        : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return ok(result);
  },
};

const budgetsList: ToolDef = {
  name: 'finance.budgets.list',
  description: 'List budgets with current spend. Supports filtering by period and active state.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search by budget name' },
      period: {
        type: 'string',
        enum: ['monthly', 'yearly'],
        description: 'Filter by budget period',
      },
      active: { type: 'string', enum: ['true', 'false'], description: 'Filter by active state' },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await getClient().finance.budgets.list.query({
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      period:
        args['period'] === 'monthly' || args['period'] === 'yearly' ? args['period'] : undefined,
      active: args['active'] === 'true' || args['active'] === 'false' ? args['active'] : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return ok(result);
  },
};

export const financeTools: readonly ToolDef[] = [transactionsList, entitiesList, budgetsList];
