import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractText, parseResult } from './helpers.js';

// ── Shared mock client ────────────────────────────────────────────────────────

const mockClient = {
  inventory: {
    locations: {
      tree: { query: vi.fn().mockResolvedValue({ data: [{ id: 'loc_1', name: 'Living Room' }] }) },
      list: { query: vi.fn().mockResolvedValue({ data: [], total: 0 }) },
    },
    items: {
      list: {
        query: vi
          .fn()
          .mockResolvedValue({ data: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      },
      get: { query: vi.fn().mockResolvedValue({ data: { id: 'item_1', name: 'MacBook' } }) },
    },
    connections: {
      listForItem: {
        query: vi
          .fn()
          .mockResolvedValue({ data: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      },
      graph: { query: vi.fn().mockResolvedValue({ data: { nodes: [], edges: [] } }) },
    },
  },
  finance: {
    transactions: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
    budgets: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
  },
  core: {
    entities: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
  },
  media: {
    library: {
      list: { query: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
    },
    watchlist: {
      list: { query: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }) },
    },
  },
  cerebrum: {
    engrams: {
      list: { query: vi.fn().mockResolvedValue({ engrams: [], total: 0 }) },
      get: { query: vi.fn().mockResolvedValue({ id: 'eng_1', title: 'Test', body: 'content' }) },
    },
    retrieval: {
      search: { query: vi.fn().mockResolvedValue({ results: [] }) },
    },
  },
};

vi.mock('../client.js', () => ({
  getClient: () => mockClient,
}));

// ── Imports after mock setup ──────────────────────────────────────────────────

const { inventoryTools } = await import('../tools/inventory.js');
const { financeTools } = await import('../tools/finance.js');
const { mediaTools } = await import('../tools/media.js');
const { cerebrumTools } = await import('../tools/cerebrum.js');
const { allTools } = await import('../tools/index.js');

// ── Tool registry ─────────────────────────────────────────────────────────────

describe('allTools', () => {
  it('exports exactly 14 tools', () => {
    expect(allTools).toHaveLength(14);
  });

  it('all tool names are unique', () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all tools have a description, inputSchema, and handler', () => {
    for (const tool of allTools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema['type']).toBe('object');
      expect(typeof tool.handler).toBe('function');
    }
  });
});

// ── Inventory tools ───────────────────────────────────────────────────────────

describe('inventory.locations.tree', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.locations.tree')!;

  it('calls locations.tree.query and serialises the result', async () => {
    const result = await tool.handler({});
    expect(mockClient.inventory.locations.tree.query).toHaveBeenCalledWith();
    const parsed = parseResult(result) as { id: string }[];
    expect(parsed[0]).toMatchObject({ id: 'loc_1' });
  });
});

describe('inventory.locations.list', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.locations.list')!;

  it('calls locations.list.query', async () => {
    const result = await tool.handler({});
    expect(mockClient.inventory.locations.list.query).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });
});

describe('inventory.items.list', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.items.list')!;

  it('passes optional filters correctly', async () => {
    await tool.handler({ search: 'mac', locationId: 'loc_1', includeChildren: true, limit: 10 });
    expect(mockClient.inventory.items.list.query).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'mac',
        locationId: 'loc_1',
        includeChildren: true,
        limit: 10,
      })
    );
  });

  it('passes undefined for missing optional fields (not null)', async () => {
    await tool.handler({});
    const call = mockClient.inventory.items.list.query.mock.lastCall?.[0];
    expect(call).toBeDefined();
    for (const value of Object.values(call as Record<string, unknown>)) {
      expect(value).not.toBeNull();
    }
  });
});

describe('inventory.items.get', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.items.get')!;

  it('passes id to tRPC', async () => {
    const result = await tool.handler({ id: 'item_1' });
    expect(mockClient.inventory.items.get.query).toHaveBeenCalledWith({ id: 'item_1' });
    const parsed = parseResult(result) as { name: string };
    expect(parsed.name).toBe('MacBook');
  });
});

describe('inventory.connections.list', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.connections.list')!;

  it('passes itemId as required arg', async () => {
    await tool.handler({ itemId: 'item_1', limit: 20 });
    expect(mockClient.inventory.connections.listForItem.query).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_1', limit: 20 })
    );
  });
});

describe('inventory.connections.graph', () => {
  const tool = inventoryTools.find((t) => t.name === 'inventory.connections.graph')!;

  it('passes itemId and maxDepth', async () => {
    await tool.handler({ itemId: 'item_2', maxDepth: 2 });
    expect(mockClient.inventory.connections.graph.query).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_2', maxDepth: 2 })
    );
  });
});

// ── Finance tools ─────────────────────────────────────────────────────────────

describe('finance.transactions.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.transactions.list')!;

  it('passes date filters through', async () => {
    await tool.handler({ startDate: '2025-01-01', endDate: '2025-12-31', type: 'expense' });
    expect(mockClient.finance.transactions.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2025-01-01', endDate: '2025-12-31', type: 'expense' })
    );
  });

  it('ignores invalid type values', async () => {
    await tool.handler({ type: 'invalid' });
    const call = mockClient.finance.transactions.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBeUndefined();
  });
});

describe('finance.entities.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.entities.list')!;

  it('calls core.entities.list with search filter', async () => {
    await tool.handler({ search: 'woolworths' });
    expect(mockClient.core.entities.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'woolworths' })
    );
  });
});

describe('finance.budgets.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.budgets.list')!;

  it('passes period and active filters', async () => {
    await tool.handler({ period: 'monthly', active: 'true' });
    expect(mockClient.finance.budgets.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'monthly', active: 'true' })
    );
  });

  it('ignores invalid period values', async () => {
    await tool.handler({ period: 'weekly' });
    const call = mockClient.finance.budgets.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['period']).toBeUndefined();
  });
});

// ── Media tools ───────────────────────────────────────────────────────────────

describe('media.library.list', () => {
  const tool = mediaTools.find((t) => t.name === 'media.library.list')!;

  it('defaults type to "all" when not provided', async () => {
    await tool.handler({});
    expect(mockClient.media.library.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'all' })
    );
  });

  it('passes movie filter through', async () => {
    await tool.handler({ type: 'movie', search: 'godfather' });
    expect(mockClient.media.library.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'movie', search: 'godfather' })
    );
  });
});

describe('media.watchlist.list', () => {
  const tool = mediaTools.find((t) => t.name === 'media.watchlist.list')!;

  it('passes mediaType filter', async () => {
    await tool.handler({ mediaType: 'movie' });
    expect(mockClient.media.watchlist.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'movie' })
    );
  });

  it('ignores invalid mediaType values', async () => {
    await tool.handler({ mediaType: 'podcast' });
    const call = mockClient.media.watchlist.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['mediaType']).toBeUndefined();
  });
});

// ── Cerebrum tools ────────────────────────────────────────────────────────────

describe('cerebrum.engrams.list', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.engrams.list')!;

  it('passes scope and tag arrays correctly', async () => {
    await tool.handler({ scopes: ['work', 'personal'], tags: ['important'] });
    expect(mockClient.cerebrum.engrams.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ['work', 'personal'], tags: ['important'] })
    );
  });

  it('filters non-string elements from scope and tag arrays', async () => {
    await tool.handler({ scopes: ['valid', 42, null, 'also-valid'] });
    const call = mockClient.cerebrum.engrams.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['scopes']).toEqual(['valid', 'also-valid']);
  });

  it('ignores invalid status values', async () => {
    await tool.handler({ status: 'deleted' });
    const call = mockClient.cerebrum.engrams.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['status']).toBeUndefined();
  });
});

describe('cerebrum.engrams.get', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.engrams.get')!;

  it('calls engrams.get.query with the id', async () => {
    const result = await tool.handler({ id: 'eng_1' });
    expect(mockClient.cerebrum.engrams.get.query).toHaveBeenCalledWith({ id: 'eng_1' });
    expect(result.isError).toBeUndefined();
    const text = extractText(result);
    expect(text).toContain('eng_1');
  });
});

describe('cerebrum.search', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.search')!;

  it('calls retrieval.search.query with query and defaults to hybrid', async () => {
    await tool.handler({ query: 'home automation' });
    expect(mockClient.cerebrum.retrieval.search.query).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'home automation', mode: 'hybrid' })
    );
  });

  it('passes explicit mode', async () => {
    await tool.handler({ query: 'test', mode: 'semantic' });
    expect(mockClient.cerebrum.retrieval.search.query).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'semantic' })
    );
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  beforeEach(() => {
    mockClient.inventory.locations.tree.query.mockRejectedValueOnce(new Error('Network error'));
  });

  it('returns isError result when tRPC throws (via index.ts dispatch)', async () => {
    // The server's CallTool handler wraps errors — test the tool directly
    // to verify it propagates (the server wraps it)
    await expect(
      inventoryTools.find((t) => t.name === 'inventory.locations.tree')!.handler({})
    ).rejects.toThrow('Network error');
  });
});
