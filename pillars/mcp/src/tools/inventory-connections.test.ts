import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  mockPillarInventory,
  parseResult,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { connectionTools } = await import('./inventory-connections.js');

function tool(name: string) {
  const t = connectionTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

const connections = mockPillarInventory.inventory.connections;

beforeEach(() => {
  vi.clearAllMocks();
  connections.listForItem.mockResolvedValue(
    callOk({
      data: [{ id: 1, itemAId: 'item_1', itemBId: 'item_2', createdAt: '2025-01-01' }],
      pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
    })
  );
  connections.graph.mockResolvedValue(
    callOk({
      data: {
        nodes: [{ id: 'item_1' }, { id: 'item_2' }],
        edges: [{ source: 'item_1', target: 'item_2' }],
      },
    })
  );
  connections.connect.mockResolvedValue(
    callOk({
      data: { id: 1, itemAId: 'item_1', itemBId: 'item_2', createdAt: '2025-01-01' },
      message: 'Items connected',
    })
  );
  connections.disconnect.mockResolvedValue(callOk({ message: 'Items disconnected' }));
});

describe('inventory.connections.list', () => {
  it('passes itemId and optional pagination', async () => {
    await tool('inventory.connections.list').handler({ itemId: 'item_1', limit: 20, offset: 10 });
    expect(connections.listForItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_1', limit: 20, offset: 10 })
    );
  });

  it('omits limit and offset when absent', async () => {
    await tool('inventory.connections.list').handler({ itemId: 'item_1' });
    const call = connections.listForItem.mock.lastCall?.[0] as Record<string, unknown>;
    expect('limit' in call).toBe(false);
    expect('offset' in call).toBe(false);
  });

  it('returns isError when itemId is missing', async () => {
    const result = await tool('inventory.connections.list').handler({});
    expect(result.isError).toBe(true);
    expect(connections.listForItem).not.toHaveBeenCalled();
  });

  it('returns isError when itemId is empty string', async () => {
    expect((await tool('inventory.connections.list').handler({ itemId: '' })).isError).toBe(true);
  });

  it('returns isError on unavailable', async () => {
    connections.listForItem.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('inventory.connections.list').handler({ itemId: 'item_1' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.connections.graph', () => {
  it('passes itemId and maxDepth', async () => {
    await tool('inventory.connections.graph').handler({ itemId: 'item_2', maxDepth: 2 });
    expect(connections.graph).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_2', maxDepth: 2 })
    );
  });

  it('omits maxDepth when absent', async () => {
    await tool('inventory.connections.graph').handler({ itemId: 'item_1' });
    const call = connections.graph.mock.lastCall?.[0] as Record<string, unknown>;
    expect('maxDepth' in call).toBe(false);
  });

  it('returns graph data wrapped in the data envelope', async () => {
    const result = await tool('inventory.connections.graph').handler({ itemId: 'item_1' });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { data: { nodes: unknown[]; edges: unknown[] } };
    expect(parsed.data.nodes).toHaveLength(2);
    expect(parsed.data.edges).toHaveLength(1);
  });

  it('returns isError when itemId is missing', async () => {
    const result = await tool('inventory.connections.graph').handler({});
    expect(result.isError).toBe(true);
    expect(connections.graph).not.toHaveBeenCalled();
  });

  it('returns isError when itemId is empty string', async () => {
    expect((await tool('inventory.connections.graph').handler({ itemId: '' })).isError).toBe(true);
  });
});

describe('inventory.connections.connect', () => {
  it('connects two items and returns connection record', async () => {
    const result = await tool('inventory.connections.connect').handler({
      itemAId: 'item_1',
      itemBId: 'item_2',
    });
    expect(connections.connect).toHaveBeenCalledWith({ itemAId: 'item_1', itemBId: 'item_2' });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { data: { itemAId: string; itemBId: string } };
    expect(parsed.data.itemAId).toBe('item_1');
    expect(parsed.data.itemBId).toBe('item_2');
  });

  it('returns isError when itemAId is missing', async () => {
    const result = await tool('inventory.connections.connect').handler({ itemBId: 'item_2' });
    expect(result.isError).toBe(true);
    expect(connections.connect).not.toHaveBeenCalled();
  });

  it('returns isError when itemBId is missing', async () => {
    const result = await tool('inventory.connections.connect').handler({ itemAId: 'item_1' });
    expect(result.isError).toBe(true);
    expect(connections.connect).not.toHaveBeenCalled();
  });

  it('returns isError when itemAId is empty string', async () => {
    expect(
      (await tool('inventory.connections.connect').handler({ itemAId: '', itemBId: 'item_2' }))
        .isError
    ).toBe(true);
  });

  it('returns isError when itemBId is empty string', async () => {
    expect(
      (await tool('inventory.connections.connect').handler({ itemAId: 'item_1', itemBId: '' }))
        .isError
    ).toBe(true);
  });

  it('returns isError on unavailable', async () => {
    connections.connect.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('inventory.connections.connect').handler({
      itemAId: 'item_1',
      itemBId: 'item_2',
    });
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    connections.connect.mockResolvedValueOnce(callContractMismatch('inventory', '1.0.0', '2.0.0'));
    const result = await tool('inventory.connections.connect').handler({
      itemAId: 'item_1',
      itemBId: 'item_2',
    });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.connections.disconnect', () => {
  it('disconnects two items and returns message', async () => {
    const result = await tool('inventory.connections.disconnect').handler({
      itemAId: 'item_1',
      itemBId: 'item_2',
    });
    expect(connections.disconnect).toHaveBeenCalledWith({ itemAId: 'item_1', itemBId: 'item_2' });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { message: string };
    expect(parsed.message).toBe('Items disconnected');
  });

  it('returns isError when itemAId is missing', async () => {
    const result = await tool('inventory.connections.disconnect').handler({ itemBId: 'item_2' });
    expect(result.isError).toBe(true);
    expect(connections.disconnect).not.toHaveBeenCalled();
  });

  it('returns isError when itemBId is missing', async () => {
    const result = await tool('inventory.connections.disconnect').handler({ itemAId: 'item_1' });
    expect(result.isError).toBe(true);
    expect(connections.disconnect).not.toHaveBeenCalled();
  });
});
