import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  MOCK_FIXTURE,
  MOCK_FIXTURE_CONN,
  mockPillarInventory,
  parseResult,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { fixtureTools } = await import('./inventory-fixtures.js');

function getTool(name: string) {
  const tool = fixtureTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

const fixtures = mockPillarInventory.inventory.fixtures;

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.list.mockResolvedValue(callOk({ data: [MOCK_FIXTURE], total: 1 }));
  fixtures.get.mockResolvedValue(callOk({ data: MOCK_FIXTURE }));
  fixtures.create.mockResolvedValue(callOk({ data: MOCK_FIXTURE, message: 'Fixture created' }));
  fixtures.update.mockResolvedValue(callOk({ data: MOCK_FIXTURE, message: 'Fixture updated' }));
  fixtures.delete.mockResolvedValue(callOk({ message: 'Fixture deleted' }));
  fixtures.connect.mockResolvedValue(
    callOk({ data: MOCK_FIXTURE_CONN, message: 'Item connected to fixture' })
  );
  fixtures.disconnect.mockResolvedValue(callOk({ message: 'Item disconnected from fixture' }));
  fixtures.listForItem.mockResolvedValue(
    callOk({
      data: [MOCK_FIXTURE_CONN],
      pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
    })
  );
});

describe('inventory.fixtures.list', () => {
  const tool = getTool('inventory.fixtures.list');

  it('returns fixture list without filters', async () => {
    const result = await tool.handler({});
    const data = parseResult(result);
    expect(fixtures.list).toHaveBeenCalled();
    expect(data).toMatchObject({ data: [MOCK_FIXTURE], total: 1 });
  });

  it('passes locationId filter', async () => {
    await tool.handler({ locationId: 'loc_1' });
    expect(fixtures.list).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'loc_1' }));
  });

  it('passes type filter', async () => {
    await tool.handler({ type: 'outlet' });
    expect(fixtures.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'outlet' }));
  });

  it('passes pagination args', async () => {
    await tool.handler({ limit: 10, offset: 20 });
    expect(fixtures.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
  });

  it('returns isError on unavailable', async () => {
    fixtures.list.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('inventory.fixtures.get', () => {
  const tool = getTool('inventory.fixtures.get');

  it('returns fixture by id wrapped in the data envelope', async () => {
    const result = await tool.handler({ id: 'fixture_1' });
    expect(fixtures.get).toHaveBeenCalledWith({ id: 'fixture_1' });
    expect(parseResult(result)).toMatchObject({ data: { id: 'fixture_1' } });
  });

  it('returns toolError for missing id', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(fixtures.get).not.toHaveBeenCalled();
  });

  it('returns toolError for empty string id', async () => {
    const result = await tool.handler({ id: '' });
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    fixtures.get.mockResolvedValueOnce(callContractMismatch('inventory', '1.0.0', '2.0.0'));
    const result = await tool.handler({ id: 'fixture_1' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.fixtures.create', () => {
  const tool = getTool('inventory.fixtures.create');

  it('creates fixture with required fields', async () => {
    const result = await tool.handler({ name: 'Outlet A', type: 'outlet' });
    expect(fixtures.create).toHaveBeenCalledWith(
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
    expect(fixtures.create).toHaveBeenCalledWith({
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

  it('returns isError on unavailable', async () => {
    fixtures.create.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool.handler({ name: 'Outlet A', type: 'outlet' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.fixtures.update', () => {
  const tool = getTool('inventory.fixtures.update');

  it('updates name', async () => {
    const result = await tool.handler({ id: 'fixture_1', name: 'New Name' });
    expect(fixtures.update).toHaveBeenCalledWith({
      id: 'fixture_1',
      data: { name: 'New Name' },
    });
    expect(parseResult(result)).toMatchObject({ message: 'Fixture updated' });
  });

  it('clears locationId when passed null', async () => {
    await tool.handler({ id: 'fixture_1', locationId: null });
    expect(fixtures.update).toHaveBeenCalledWith({
      id: 'fixture_1',
      data: { locationId: null },
    });
  });

  it('clears notes when passed null', async () => {
    await tool.handler({ id: 'fixture_1', notes: null });
    expect(fixtures.update).toHaveBeenCalledWith({
      id: 'fixture_1',
      data: { notes: null },
    });
  });

  it('omits absent fields from patch (no-op for absent keys)', async () => {
    await tool.handler({ id: 'fixture_1', name: 'Updated' });
    const call = fixtures.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(call?.data).not.toHaveProperty('locationId');
    expect(call?.data).not.toHaveProperty('notes');
    expect(call?.data).not.toHaveProperty('type');
  });

  it('returns toolError for missing id', async () => {
    const result = await tool.handler({ name: 'Updated' });
    expect(result.isError).toBe(true);
    expect(fixtures.update).not.toHaveBeenCalled();
  });
});

describe('inventory.fixtures.delete', () => {
  const tool = getTool('inventory.fixtures.delete');

  it('deletes fixture by id', async () => {
    const result = await tool.handler({ id: 'fixture_1' });
    expect(fixtures.delete).toHaveBeenCalledWith({ id: 'fixture_1' });
    expect(parseResult(result)).toMatchObject({ message: 'Fixture deleted' });
  });

  it('returns toolError for missing id', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(fixtures.delete).not.toHaveBeenCalled();
  });
});

describe('inventory.fixtures.connect', () => {
  const tool = getTool('inventory.fixtures.connect');

  it('connects item to fixture', async () => {
    const result = await tool.handler({ itemId: 'item_1', fixtureId: 'fixture_1' });
    expect(fixtures.connect).toHaveBeenCalledWith({
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

  it('returns isError on unavailable', async () => {
    fixtures.connect.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool.handler({ itemId: 'item_1', fixtureId: 'fixture_1' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.fixtures.disconnect', () => {
  const tool = getTool('inventory.fixtures.disconnect');

  it('disconnects item from fixture', async () => {
    const result = await tool.handler({ itemId: 'item_1', fixtureId: 'fixture_1' });
    expect(fixtures.disconnect).toHaveBeenCalledWith({
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
});

describe('inventory.fixtures.listForItem', () => {
  const tool = getTool('inventory.fixtures.listForItem');

  it('returns fixture connections for item', async () => {
    const result = await tool.handler({ itemId: 'item_1' });
    expect(fixtures.listForItem).toHaveBeenCalledWith({
      itemId: 'item_1',
      limit: undefined,
      offset: undefined,
    });
    expect(parseResult(result)).toMatchObject({ data: [MOCK_FIXTURE_CONN] });
  });

  it('passes pagination args', async () => {
    await tool.handler({ itemId: 'item_1', limit: 5, offset: 10 });
    expect(fixtures.listForItem).toHaveBeenCalledWith({
      itemId: 'item_1',
      limit: 5,
      offset: 10,
    });
  });

  it('returns toolError for missing itemId', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(fixtures.listForItem).not.toHaveBeenCalled();
  });
});
