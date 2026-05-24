import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockClient, parseResult } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

const { connectionTools } = await import('./inventory-connections.js');

function tool(name: string) {
  const t = connectionTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

describe('inventory.connections.list', () => {
  it('passes itemId and optional pagination', async () => {
    await tool('inventory.connections.list').handler({ itemId: 'item_1', limit: 20, offset: 10 });
    expect(mockClient.inventory.connections.listForItem.query).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_1', limit: 20, offset: 10 })
    );
  });

  it('omits limit and offset when absent', async () => {
    await tool('inventory.connections.list').handler({ itemId: 'item_1' });
    const call = mockClient.inventory.connections.listForItem.query.mock.lastCall?.[0] as Record<
      string,
      unknown
    >;
    expect(call['limit']).toBeUndefined();
    expect(call['offset']).toBeUndefined();
  });

  it('returns isError when itemId is missing', async () => {
    const result = await tool('inventory.connections.list').handler({});
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.connections.listForItem.query).not.toHaveBeenCalled();
  });

  it('returns isError when itemId is empty string', async () => {
    expect((await tool('inventory.connections.list').handler({ itemId: '' })).isError).toBe(true);
  });
});

describe('inventory.connections.graph', () => {
  it('passes itemId and maxDepth', async () => {
    await tool('inventory.connections.graph').handler({ itemId: 'item_2', maxDepth: 2 });
    expect(mockClient.inventory.connections.graph.query).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_2', maxDepth: 2 })
    );
  });

  it('omits maxDepth when absent', async () => {
    await tool('inventory.connections.graph').handler({ itemId: 'item_1' });
    const call = mockClient.inventory.connections.graph.query.mock.lastCall?.[0] as Record<
      string,
      unknown
    >;
    expect(call['maxDepth']).toBeUndefined();
  });

  it('returns graph data with nodes and edges', async () => {
    const result = await tool('inventory.connections.graph').handler({ itemId: 'item_1' });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { nodes: unknown[]; edges: unknown[] };
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
  });

  it('returns isError when itemId is missing', async () => {
    const result = await tool('inventory.connections.graph').handler({});
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.connections.graph.query).not.toHaveBeenCalled();
  });

  it('returns isError when itemId is empty string', async () => {
    expect((await tool('inventory.connections.graph').handler({ itemId: '' })).isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

describe('inventory.connections.connect', () => {
  it('connects two items and returns connection record', async () => {
    const result = await tool('inventory.connections.connect').handler({
      itemAId: 'item_1',
      itemBId: 'item_2',
    });
    expect(mockClient.inventory.connections.connect.mutate).toHaveBeenCalledWith({
      itemAId: 'item_1',
      itemBId: 'item_2',
    });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { itemAId: string; itemBId: string };
    expect(parsed.itemAId).toBe('item_1');
    expect(parsed.itemBId).toBe('item_2');
  });

  it('returns isError when itemAId is missing', async () => {
    const result = await tool('inventory.connections.connect').handler({ itemBId: 'item_2' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.connections.connect.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when itemBId is missing', async () => {
    const result = await tool('inventory.connections.connect').handler({ itemAId: 'item_1' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.connections.connect.mutate).not.toHaveBeenCalled();
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

  it('propagates tRPC errors (handled by MCP framework)', async () => {
    const err = Object.assign(new Error('Connection already exists'), {
      data: { code: 'CONFLICT' },
    });
    mockClient.inventory.connections.connect.mutate.mockRejectedValueOnce(err);
    await expect(
      tool('inventory.connections.connect').handler({ itemAId: 'item_1', itemBId: 'item_2' })
    ).rejects.toThrow('Connection already exists');
  });
});

describe('inventory.connections.disconnect', () => {
  it('disconnects two items and returns message', async () => {
    const result = await tool('inventory.connections.disconnect').handler({
      itemAId: 'item_1',
      itemBId: 'item_2',
    });
    expect(mockClient.inventory.connections.disconnect.mutate).toHaveBeenCalledWith({
      itemAId: 'item_1',
      itemBId: 'item_2',
    });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { message: string };
    expect(parsed.message).toBe('Items disconnected');
  });

  it('returns isError when itemAId is missing', async () => {
    const result = await tool('inventory.connections.disconnect').handler({ itemBId: 'item_2' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.connections.disconnect.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when itemBId is missing', async () => {
    const result = await tool('inventory.connections.disconnect').handler({ itemAId: 'item_1' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.connections.disconnect.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when itemAId is empty string', async () => {
    expect(
      (await tool('inventory.connections.disconnect').handler({ itemAId: '', itemBId: 'item_2' }))
        .isError
    ).toBe(true);
  });

  it('returns isError when itemBId is empty string', async () => {
    expect(
      (await tool('inventory.connections.disconnect').handler({ itemAId: 'item_1', itemBId: '' }))
        .isError
    ).toBe(true);
  });
});
