import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockClient, parseResult } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

const { locationTools } = await import('./inventory-locations.js');

function tool(name: string) {
  const t = locationTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('inventory.locations.tree', () => {
  it('calls tree.query and returns data', async () => {
    const result = await tool('inventory.locations.tree').handler({});
    expect(mockClient.inventory.locations.tree.query).toHaveBeenCalled();
    const parsed = parseResult(result) as { id: string }[];
    expect(parsed[0]).toMatchObject({ id: 'loc_1' });
    expect(result.isError).toBeUndefined();
  });
});

describe('inventory.locations.list', () => {
  it('calls list.query', async () => {
    const result = await tool('inventory.locations.list').handler({});
    expect(mockClient.inventory.locations.list.query).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });
});

describe('inventory.locations.create', () => {
  it('creates a root location with name only', async () => {
    const result = await tool('inventory.locations.create').handler({ name: 'Office' });
    expect(mockClient.inventory.locations.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Office' })
    );
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { name: string };
    expect(parsed.name).toBe('Office');
  });

  it('passes parentId string', async () => {
    await tool('inventory.locations.create').handler({ name: 'Shelf', parentId: 'loc_1' });
    expect(mockClient.inventory.locations.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'loc_1' })
    );
  });

  it('passes explicit null parentId', async () => {
    await tool('inventory.locations.create').handler({ name: 'Root', parentId: null });
    expect(mockClient.inventory.locations.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null })
    );
  });

  it('passes sortOrder', async () => {
    await tool('inventory.locations.create').handler({ name: 'Bedroom', sortOrder: 2 });
    expect(mockClient.inventory.locations.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 2 })
    );
  });

  it('returns isError when name is missing', async () => {
    const result = await tool('inventory.locations.create').handler({});
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.locations.create.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when name is empty string', async () => {
    const result = await tool('inventory.locations.create').handler({ name: '' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.locations.update', () => {
  it('updates name only', async () => {
    const result = await tool('inventory.locations.update').handler({ id: 'loc_1', name: 'Den' });
    expect(mockClient.inventory.locations.update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'loc_1', data: { name: 'Den' } })
    );
    expect(result.isError).toBeUndefined();
  });

  it('sets parentId to a value', async () => {
    await tool('inventory.locations.update').handler({ id: 'loc_2', parentId: 'loc_1' });
    const call = mockClient.inventory.locations.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.parentId).toBe('loc_1');
  });

  it('sets parentId to null (promote to root)', async () => {
    await tool('inventory.locations.update').handler({ id: 'loc_2', parentId: null });
    const call = mockClient.inventory.locations.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.parentId).toBeNull();
  });

  it('does not include parentId when not provided', async () => {
    await tool('inventory.locations.update').handler({ id: 'loc_1', name: 'New Name' });
    const call = mockClient.inventory.locations.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect('parentId' in call.data).toBe(false);
  });

  it('updates sortOrder', async () => {
    await tool('inventory.locations.update').handler({ id: 'loc_1', sortOrder: 5 });
    const call = mockClient.inventory.locations.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.sortOrder).toBe(5);
  });

  it('returns isError when id is missing', async () => {
    const result = await tool('inventory.locations.update').handler({ name: 'No ID' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.locations.update.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when id is empty string', async () => {
    const result = await tool('inventory.locations.update').handler({ id: '' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.locations.delete', () => {
  it('deletes with force: false by default', async () => {
    const result = await tool('inventory.locations.delete').handler({ id: 'loc_1' });
    expect(mockClient.inventory.locations.delete.mutate).toHaveBeenCalledWith({
      id: 'loc_1',
      force: false,
    });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { message: string };
    expect(parsed.message).toBe('Location deleted');
  });

  it('passes force: true', async () => {
    await tool('inventory.locations.delete').handler({ id: 'loc_1', force: true });
    expect(mockClient.inventory.locations.delete.mutate).toHaveBeenCalledWith({
      id: 'loc_1',
      force: true,
    });
  });

  it('surfaces requiresConfirmation without isError', async () => {
    mockClient.inventory.locations.delete.mutate.mockResolvedValueOnce({
      requiresConfirmation: true,
      stats: { childCount: 2, descendantCount: 5, itemCount: 3, totalItemCount: 10 },
    });
    const result = await tool('inventory.locations.delete').handler({ id: 'loc_1' });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { requiresConfirmation: boolean };
    expect(parsed.requiresConfirmation).toBe(true);
  });

  it('returns isError when id is missing', async () => {
    const result = await tool('inventory.locations.delete').handler({});
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.locations.delete.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when id is empty string', async () => {
    expect((await tool('inventory.locations.delete').handler({ id: '' })).isError).toBe(true);
  });
});
