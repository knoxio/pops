import { vi } from 'vitest';

import type { CallResult } from '@pops/pillar-sdk/client';

export function callOk<T>(value: T): CallResult<T> {
  return { kind: 'ok', value };
}

export const callUnavailable = (pillar: string): CallResult<never> => ({
  kind: 'unavailable',
  pillar,
});

export const callContractMismatch = (
  pillar: string,
  expected: string,
  actual: string
): CallResult<never> => ({ kind: 'contract-mismatch', pillar, expected, actual });

const MOCK_LOCATION = { id: 'loc_1', name: 'Living Room', parentId: null, sortOrder: 0 };
const MOCK_LOCATION_2 = { id: 'loc_2', name: 'Office', parentId: null, sortOrder: 1 };
const MOCK_ITEM = {
  id: 'item_1',
  itemName: 'MacBook',
  brand: 'Apple',
  model: 'MacBook Pro 14"',
  type: 'electronics',
  condition: 'good',
  locationId: 'loc_1',
  inUse: true,
  deductible: false,
  assetId: 'MBP01',
  notes: null,
  purchaseDate: null,
  warrantyExpires: null,
  replacementValue: 3000,
  resaleValue: 1500,
  purchasePrice: 3200,
  purchasedFromName: 'Apple Store',
  lastEditedTime: '2025-01-01T00:00:00.000Z',
};
const MOCK_ITEM_2 = { ...MOCK_ITEM, id: 'item_2', itemName: 'Dell Monitor', assetId: 'MON01' };
const MOCK_CONNECTION = {
  id: 1,
  itemAId: 'item_1',
  itemBId: 'item_2',
  createdAt: '2025-01-01T00:00:00.000Z',
};

export const MOCK_FIXTURE = {
  id: 'fixture_1',
  name: 'Living Room Outlet A',
  type: 'outlet',
  locationId: 'loc_1',
  notes: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  lastEditedTime: '2024-01-01T00:00:00.000Z',
};

export const MOCK_FIXTURE_CONN = {
  id: 1,
  itemId: 'item_1',
  fixtureId: 'fixture_1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

export const mockPillarInventory = {
  inventory: {
    locations: {
      tree: vi.fn().mockResolvedValue(callOk({ data: [{ ...MOCK_LOCATION, children: [] }] })),
      list: vi.fn().mockResolvedValue(callOk({ data: [MOCK_LOCATION], total: 1 })),
      create: vi
        .fn()
        .mockResolvedValue(callOk({ data: MOCK_LOCATION_2, message: 'Location created' })),
      update: vi
        .fn()
        .mockResolvedValue(callOk({ data: MOCK_LOCATION, message: 'Location updated' })),
      delete: vi.fn().mockResolvedValue(callOk({ message: 'Location deleted' })),
    },
  },
};

export const mockPillarFinance = {
  finance: {
    transactions: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
    },
    budgets: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
    },
  },
};

export const mockClient = {
  inventory: {
    locations: {
      tree: { query: vi.fn().mockResolvedValue({ data: [{ ...MOCK_LOCATION, children: [] }] }) },
      list: { query: vi.fn().mockResolvedValue({ data: [MOCK_LOCATION], total: 1 }) },
      create: {
        mutate: vi.fn().mockResolvedValue({ data: MOCK_LOCATION_2, message: 'Location created' }),
      },
      update: {
        mutate: vi.fn().mockResolvedValue({ data: MOCK_LOCATION, message: 'Location updated' }),
      },
      delete: { mutate: vi.fn().mockResolvedValue({ message: 'Location deleted' }) },
    },
    items: {
      list: {
        query: vi.fn().mockResolvedValue({
          data: [MOCK_ITEM],
          pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
        }),
      },
      get: { query: vi.fn().mockResolvedValue({ data: MOCK_ITEM }) },
      create: {
        mutate: vi.fn().mockResolvedValue({ data: MOCK_ITEM, message: 'Inventory item created' }),
      },
      update: {
        mutate: vi.fn().mockResolvedValue({ data: MOCK_ITEM, message: 'Inventory item updated' }),
      },
      delete: { mutate: vi.fn().mockResolvedValue({ message: 'Inventory item deleted' }) },
    },
    connections: {
      listForItem: {
        query: vi.fn().mockResolvedValue({
          data: [MOCK_CONNECTION],
          pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
        }),
      },
      graph: {
        query: vi.fn().mockResolvedValue({
          data: {
            nodes: [MOCK_ITEM, MOCK_ITEM_2],
            edges: [{ source: 'item_1', target: 'item_2' }],
          },
        }),
      },
      connect: {
        mutate: vi.fn().mockResolvedValue({ data: MOCK_CONNECTION, message: 'Items connected' }),
      },
      disconnect: { mutate: vi.fn().mockResolvedValue({ message: 'Items disconnected' }) },
    },
    fixtures: {
      list: { query: vi.fn().mockResolvedValue({ data: [MOCK_FIXTURE], total: 1 }) },
      get: { query: vi.fn().mockResolvedValue({ data: MOCK_FIXTURE }) },
      create: {
        mutate: vi.fn().mockResolvedValue({ data: MOCK_FIXTURE, message: 'Fixture created' }),
      },
      update: {
        mutate: vi.fn().mockResolvedValue({ data: MOCK_FIXTURE, message: 'Fixture updated' }),
      },
      delete: { mutate: vi.fn().mockResolvedValue({ message: 'Fixture deleted' }) },
      connect: {
        mutate: vi
          .fn()
          .mockResolvedValue({ data: MOCK_FIXTURE_CONN, message: 'Item connected to fixture' }),
      },
      disconnect: {
        mutate: vi.fn().mockResolvedValue({ message: 'Item disconnected from fixture' }),
      },
      listForItem: {
        query: vi.fn().mockResolvedValue({
          data: [MOCK_FIXTURE_CONN],
          pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
        }),
      },
    },
  },
  finance: {
    transactions: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
    budgets: { list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) } },
  },
  core: {
    entities: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
  },
  media: {
    library: { list: { query: vi.fn().mockResolvedValue({ items: [], total: 0 }) } },
    watchlist: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
  },
  cerebrum: {
    engrams: {
      list: { query: vi.fn().mockResolvedValue({ engrams: [], total: 0 }) },
      get: { query: vi.fn().mockResolvedValue({ id: 'eng_1', title: 'Test', body: 'content' }) },
    },
    retrieval: { search: { query: vi.fn().mockResolvedValue({ results: [] }) } },
  },
};

interface TextResultLike {
  content: readonly { type: string; text?: string }[];
  isError?: boolean;
}

export function extractText(result: TextResultLike): string {
  const first = result.content[0];
  if (!first || typeof first.text !== 'string') {
    throw new Error(`MCP result has no text content: ${JSON.stringify(result)}`);
  }
  return first.text;
}

export function parseResult(result: TextResultLike): unknown {
  return JSON.parse(extractText(result));
}
