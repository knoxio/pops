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

const LOC = { id: 'loc_1', name: 'Living Room', parentId: null, sortOrder: 0 };
const LOC2 = { id: 'loc_2', name: 'Office', parentId: null, sortOrder: 1 };
const ITEM = {
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
const ITEM2 = { ...ITEM, id: 'item_2', itemName: 'Dell Monitor', assetId: 'MON01' };
const CONN = { id: 1, itemAId: 'item_1', itemBId: 'item_2', createdAt: '2025-01-01' };

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

const PAGED1 = { pagination: { total: 1, limit: 50, offset: 0, hasMore: false } };

export const mockPillarInventory = {
  inventory: {
    locations: {
      tree: vi.fn().mockResolvedValue(callOk({ data: [{ ...LOC, children: [] }] })),
      list: vi.fn().mockResolvedValue(callOk({ data: [LOC], total: 1 })),
      create: vi.fn().mockResolvedValue(callOk({ data: LOC2, message: 'Location created' })),
      update: vi.fn().mockResolvedValue(callOk({ data: LOC, message: 'Location updated' })),
      delete: vi.fn().mockResolvedValue(callOk({ message: 'Location deleted' })),
    },
    items: {
      list: vi.fn().mockResolvedValue(callOk({ data: [ITEM], ...PAGED1 })),
      get: vi.fn().mockResolvedValue(callOk({ data: ITEM })),
      create: vi.fn().mockResolvedValue(callOk({ data: ITEM, message: 'Inventory item created' })),
      update: vi.fn().mockResolvedValue(callOk({ data: ITEM, message: 'Inventory item updated' })),
      delete: vi.fn().mockResolvedValue(callOk({ message: 'Inventory item deleted' })),
    },
    connections: {
      listForItem: vi.fn().mockResolvedValue(callOk({ data: [CONN], ...PAGED1 })),
      graph: vi.fn().mockResolvedValue(
        callOk({
          data: { nodes: [ITEM, ITEM2], edges: [{ source: 'item_1', target: 'item_2' }] },
        })
      ),
      connect: vi.fn().mockResolvedValue(callOk({ data: CONN, message: 'Items connected' })),
      disconnect: vi.fn().mockResolvedValue(callOk({ message: 'Items disconnected' })),
    },
    fixtures: {
      list: vi.fn().mockResolvedValue(callOk({ data: [MOCK_FIXTURE], total: 1 })),
      get: vi.fn().mockResolvedValue(callOk({ data: MOCK_FIXTURE })),
      create: vi.fn().mockResolvedValue(callOk({ data: MOCK_FIXTURE, message: 'Fixture created' })),
      update: vi.fn().mockResolvedValue(callOk({ data: MOCK_FIXTURE, message: 'Fixture updated' })),
      delete: vi.fn().mockResolvedValue(callOk({ message: 'Fixture deleted' })),
      connect: vi
        .fn()
        .mockResolvedValue(
          callOk({ data: MOCK_FIXTURE_CONN, message: 'Item connected to fixture' })
        ),
      disconnect: vi.fn().mockResolvedValue(callOk({ message: 'Item disconnected from fixture' })),
      listForItem: vi.fn().mockResolvedValue(callOk({ data: [MOCK_FIXTURE_CONN], ...PAGED1 })),
    },
  },
};

export const mockPillarFinance = {
  finance: {
    transactions: {
      list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })),
    },
    budgets: { list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })) },
  },
};

export const mockPillarMedia = {
  media: {
    library: { list: vi.fn().mockResolvedValue(callOk({ items: [], total: 0 })) },
    watchlist: { list: vi.fn().mockResolvedValue(callOk({ data: [], pagination: { total: 0 } })) },
  },
};

export const mockPillarCerebrum = {
  cerebrum: {
    engrams: {
      list: vi.fn().mockResolvedValue(callOk({ engrams: [], total: 0 })),
      get: vi.fn().mockResolvedValue(callOk({ id: 'eng_1', title: 'Test', body: 'content' })),
    },
    retrieval: { search: vi.fn().mockResolvedValue(callOk({ results: [] })) },
  },
};

const PILLAR_MOCKS = {
  inventory: mockPillarInventory,
  finance: mockPillarFinance,
  media: mockPillarMedia,
  cerebrum: mockPillarCerebrum,
} as const;

/** Used as the `getPillar` mock implementation in tool tests: dispatches by pillarId. */
export function pillarMockGetter<TRouter>(pillarId: string): TRouter {
  const handle = PILLAR_MOCKS[pillarId as keyof typeof PILLAR_MOCKS];
  if (!handle) throw new Error(`No mock pillar handle for '${pillarId}'`);
  return handle as TRouter;
}

// `mockClient` still mocks the legacy `getClient()` surface for the lone
// remaining risky cross-pillar call site (`finance.entities.list` → core)
// and the registry sanity tests that need `getClient` to be importable. New
// tool tests should mock `../pillar-client.js` and use `mockPillar*`.
export const mockClient = {
  core: {
    entities: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
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
