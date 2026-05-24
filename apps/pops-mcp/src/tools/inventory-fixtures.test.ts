import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MOCK_FIXTURE, MOCK_FIXTURE_CONN, mockClient, parseResult } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

const { fixtureTools } = await import('./inventory-fixtures.js');

function getTool(name: string) {
  const tool = fixtureTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.inventory.fixtures.list.query.mockResolvedValue({ data: [MOCK_FIXTURE], total: 1 });
  mockClient.inventory.fixtures.get.query.mockResolvedValue({ data: MOCK_FIXTURE });
  mockClient.inventory.fixtures.create.mutate.mockResolvedValue({
    data: MOCK_FIXTURE,
    message: 'Fixture created',
  });
  mockClient.inventory.fixtures.update.mutate.mockResolvedValue({
    data: MOCK_FIXTURE,
    message: 'Fixture updated',
  });
  mockClient.inventory.fixtures.delete.mutate.mockResolvedValue({ message: 'Fixture deleted' });
  mockClient.inventory.fixtures.connect.mutate.mockResolvedValue({
    data: MOCK_FIXTURE_CONN,
    message: 'Item connected to fixture',
  });
  mockClient.inventory.fixtures.disconnect.mutate.mockResolvedValue({
    message: 'Item disconnected from fixture',
  });
  mockClient.inventory.fixtures.listForItem.query.mockResolvedValue({
    data: [MOCK_FIXTURE_CONN],
    pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
  });
});

describe('inventory.fixtures.list', () => {
  const tool = getTool('inventory.fixtures.list');

  it('returns fixture list without filters', async () => {
    const result = await tool.handler({});
    const data = parseResult(result);
    expect(mockClient.inventory.fixtures.list.query).toHaveBeenCalledWith({
      locationId: undefined,
      type: undefined,
      limit: undefined,
      offset: undefined,
    });
    expect(data).toMatchObject({ data: [MOCK_FIXTURE], total: 1 });
  });

  it('passes locationId filter', async () => {
    await tool.handler({ locationId: 'loc_1' });
    expect(mockClient.inventory.fixtures.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'loc_1' })
    );
  });

  it('passes type filter', async () => {
    await tool.handler({ type: 'outlet' });
    expect(mockClient.inventory.fixtures.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'outlet' })
    );
  });

  it('passes pagination args', async () => {
    await tool.handler({ limit: 10, offset: 20 });
    expect(mockClient.inventory.fixtures.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 20 })
    );
  });

  it('propagates tRPC errors', async () => {
    mockClient.inventory.fixtures.list.query.mockRejectedValue(new Error('DB error'));
    await expect(tool.handler({})).rejects.toThrow('DB error');
  });
});

describe('inventory.fixtures.get', () => {
  const tool = getTool('inventory.fixtures.get');

  it('returns fixture by id', async () => {
    const result = await tool.handler({ id: 'fixture_1' });
    expect(mockClient.inventory.fixtures.get.query).toHaveBeenCalledWith({ id: 'fixture_1' });
    expect(parseResult(result)).toMatchObject({ id: 'fixture_1' });
  });

  it('returns toolError for missing id', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.fixtures.get.query).not.toHaveBeenCalled();
  });

  it('returns toolError for empty string id', async () => {
    const result = await tool.handler({ id: '' });
    expect(result.isError).toBe(true);
  });

  it('propagates NOT_FOUND tRPC errors', async () => {
    mockClient.inventory.fixtures.get.query.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(tool.handler({ id: 'missing' })).rejects.toThrow('NOT_FOUND');
  });
});

describe('inventory.fixtures.create', () => {
  const tool = getTool('inventory.fixtures.create');

  it('creates fixture with required fields', async () => {
    const result = await tool.handler({ name: 'Outlet A', type: 'outlet' });
    expect(mockClient.inventory.fixtures.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Outlet A', type: 'outlet' })
    );
    expect(parseResult(result)).toMatchObject({ data: MOCK_FIXTURE, message: 'Fixture created' });
  });

  it('passes optional locationId and notes', async () => {
    await tool.handler({
      name: 'Panel',
      type: 'patch_panel',
      locationId: 'loc_2',
      notes: 'rack A',
    });
    expect(mockClient.inventory.fixtures.create.mutate).toHaveBeenCalledWith({
      name: 'Panel',
      type: 'patch_panel',
      locationId: 'loc_2',
      notes: 'rack A',
    });
  });

  it('returns toolError for missing name', async () => {
    const result = await tool.handler({ type: 'outlet' });
    expect(result.isError).toBe(true);
  });

  it('returns toolError for missing type', async () => {
    const result = await tool.handler({ name: 'Outlet A' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.fixtures.update', () => {
  const tool = getTool('inventory.fixtures.update');

  it('updates name', async () => {
    const result = await tool.handler({ id: 'fixture_1', name: 'New Name' });
    expect(mockClient.inventory.fixtures.update.mutate).toHaveBeenCalledWith({
      id: 'fixture_1',
      data: { name: 'New Name' },
    });
    expect(parseResult(result)).toMatchObject({ message: 'Fixture updated' });
  });

  it('clears locationId when passed null', async () => {
    await tool.handler({ id: 'fixture_1', locationId: null });
    expect(mockClient.inventory.fixtures.update.mutate).toHaveBeenCalledWith({
      id: 'fixture_1',
      data: { locationId: null },
    });
  });

  it('clears notes when passed null', async () => {
    await tool.handler({ id: 'fixture_1', notes: null });
    expect(mockClient.inventory.fixtures.update.mutate).toHaveBeenCalledWith({
      id: 'fixture_1',
      data: { notes: null },
    });
  });

  it('omits absent fields from patch (no-op for absent keys)', async () => {
    await tool.handler({ id: 'fixture_1', name: 'Updated' });
    const call = mockClient.inventory.fixtures.update.mutate.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty('locationId');
    expect(call?.data).not.toHaveProperty('notes');
    expect(call?.data).not.toHaveProperty('type');
  });

  it('returns toolError for missing id', async () => {
    const result = await tool.handler({ name: 'Updated' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.fixtures.update.mutate).not.toHaveBeenCalled();
  });

  it('returns toolError when no patch fields provided', async () => {
    const result = await tool.handler({ id: 'fixture_1' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.fixtures.update.mutate).not.toHaveBeenCalled();
  });
});

describe('inventory.fixtures.delete', () => {
  const tool = getTool('inventory.fixtures.delete');

  it('deletes fixture by id', async () => {
    const result = await tool.handler({ id: 'fixture_1' });
    expect(mockClient.inventory.fixtures.delete.mutate).toHaveBeenCalledWith({ id: 'fixture_1' });
    expect(parseResult(result)).toMatchObject({ message: 'Fixture deleted' });
  });

  it('returns toolError for missing id', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.fixtures.delete.mutate).not.toHaveBeenCalled();
  });

  it('propagates NOT_FOUND tRPC errors', async () => {
    mockClient.inventory.fixtures.delete.mutate.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(tool.handler({ id: 'missing' })).rejects.toThrow('NOT_FOUND');
  });
});

describe('inventory.fixtures.connect', () => {
  const tool = getTool('inventory.fixtures.connect');

  it('connects item to fixture', async () => {
    const result = await tool.handler({ itemId: 'item_1', fixtureId: 'fixture_1' });
    expect(mockClient.inventory.fixtures.connect.mutate).toHaveBeenCalledWith({
      itemId: 'item_1',
      fixtureId: 'fixture_1',
    });
    expect(parseResult(result)).toMatchObject({ data: MOCK_FIXTURE_CONN });
  });

  it('returns toolError for missing itemId', async () => {
    const result = await tool.handler({ fixtureId: 'fixture_1' });
    expect(result.isError).toBe(true);
  });

  it('returns toolError for missing fixtureId', async () => {
    const result = await tool.handler({ itemId: 'item_1' });
    expect(result.isError).toBe(true);
  });

  it('propagates CONFLICT tRPC errors', async () => {
    mockClient.inventory.fixtures.connect.mutate.mockRejectedValue(new Error('CONFLICT'));
    await expect(tool.handler({ itemId: 'item_1', fixtureId: 'fixture_1' })).rejects.toThrow(
      'CONFLICT'
    );
  });

  it('propagates NOT_FOUND tRPC errors', async () => {
    mockClient.inventory.fixtures.connect.mutate.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(tool.handler({ itemId: 'item_bad', fixtureId: 'fixture_1' })).rejects.toThrow(
      'NOT_FOUND'
    );
  });
});

describe('inventory.fixtures.disconnect', () => {
  const tool = getTool('inventory.fixtures.disconnect');

  it('disconnects item from fixture', async () => {
    const result = await tool.handler({ itemId: 'item_1', fixtureId: 'fixture_1' });
    expect(mockClient.inventory.fixtures.disconnect.mutate).toHaveBeenCalledWith({
      itemId: 'item_1',
      fixtureId: 'fixture_1',
    });
    expect(parseResult(result)).toMatchObject({ message: 'Item disconnected from fixture' });
  });

  it('returns toolError for missing itemId', async () => {
    const result = await tool.handler({ fixtureId: 'fixture_1' });
    expect(result.isError).toBe(true);
  });

  it('returns toolError for missing fixtureId', async () => {
    const result = await tool.handler({ itemId: 'item_1' });
    expect(result.isError).toBe(true);
  });

  it('propagates NOT_FOUND tRPC errors', async () => {
    mockClient.inventory.fixtures.disconnect.mutate.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(tool.handler({ itemId: 'item_1', fixtureId: 'fixture_missing' })).rejects.toThrow(
      'NOT_FOUND'
    );
  });
});

describe('inventory.fixtures.listForItem', () => {
  const tool = getTool('inventory.fixtures.listForItem');

  it('returns fixture connections for item', async () => {
    const result = await tool.handler({ itemId: 'item_1' });
    expect(mockClient.inventory.fixtures.listForItem.query).toHaveBeenCalledWith({
      itemId: 'item_1',
      limit: undefined,
      offset: undefined,
    });
    expect(parseResult(result)).toMatchObject({ data: [MOCK_FIXTURE_CONN] });
  });

  it('passes pagination args', async () => {
    await tool.handler({ itemId: 'item_1', limit: 5, offset: 10 });
    expect(mockClient.inventory.fixtures.listForItem.query).toHaveBeenCalledWith({
      itemId: 'item_1',
      limit: 5,
      offset: 10,
    });
  });

  it('returns toolError for missing itemId', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.fixtures.listForItem.query).not.toHaveBeenCalled();
  });

  it('propagates tRPC errors', async () => {
    mockClient.inventory.fixtures.listForItem.query.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(tool.handler({ itemId: 'item_bad' })).rejects.toThrow('NOT_FOUND');
  });
});
