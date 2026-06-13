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

const { itemTools } = await import('./inventory-items.js');

function tool(name: string) {
  const t = itemTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

const items = mockPillarInventory.inventory.items;

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

beforeEach(() => {
  vi.clearAllMocks();
  items.list.mockResolvedValue(
    callOk({
      data: [MOCK_ITEM],
      pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
    })
  );
  items.get.mockResolvedValue(callOk({ data: MOCK_ITEM }));
  items.create.mockResolvedValue(callOk({ data: MOCK_ITEM, message: 'Inventory item created' }));
  items.update.mockResolvedValue(callOk({ data: MOCK_ITEM, message: 'Inventory item updated' }));
  items.delete.mockResolvedValue(callOk({ message: 'Inventory item deleted' }));
});

describe('inventory.items.list', () => {
  it('passes optional filters', async () => {
    await tool('inventory.items.list').handler({
      search: 'mac',
      locationId: 'loc_1',
      includeChildren: true,
      type: 'electronics',
      limit: 10,
      offset: 5,
    });
    expect(items.list).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'mac',
        locationId: 'loc_1',
        includeChildren: true,
        type: 'electronics',
        limit: 10,
        offset: 5,
      })
    );
  });

  it('passes undefined for absent optional fields (not null)', async () => {
    await tool('inventory.items.list').handler({});
    const call = items.list.mock.lastCall?.[0];
    for (const value of Object.values(call as Record<string, unknown>)) {
      expect(value).not.toBeNull();
    }
  });

  it('returns isError on unavailable', async () => {
    items.list.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('inventory.items.list').handler({});
    expect(result.isError).toBe(true);
  });
});

describe('inventory.items.get', () => {
  it('passes id and returns the data envelope', async () => {
    const result = await tool('inventory.items.get').handler({ id: 'item_1' });
    expect(items.get).toHaveBeenCalledWith({ id: 'item_1' });
    const parsed = parseResult(result) as { data: { itemName: string } };
    expect(parsed.data.itemName).toBe('MacBook');
  });

  it('returns isError for missing id', async () => {
    expect((await tool('inventory.items.get').handler({})).isError).toBe(true);
  });

  it('returns isError for empty id', async () => {
    expect((await tool('inventory.items.get').handler({ id: '' })).isError).toBe(true);
  });
});

describe('inventory.items.create', () => {
  it('creates with only itemName', async () => {
    const result = await tool('inventory.items.create').handler({ itemName: 'Sony TV' });
    expect(items.create).toHaveBeenCalledWith(expect.objectContaining({ itemName: 'Sony TV' }));
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { data: { id: string }; message: string };
    expect(parsed.data.id).toBe('item_1');
    expect(parsed.message).toBe('Inventory item created');
  });

  it('passes all string fields', async () => {
    await tool('inventory.items.create').handler({
      itemName: 'TV',
      brand: 'Sony',
      model: 'A95L',
      type: 'electronics',
      condition: 'new',
      locationId: 'loc_1',
      assetId: 'TV01',
      notes: 'OLED',
      purchaseDate: '2024-01-15',
      warrantyExpires: '2027-01-15',
      purchasedFromName: 'JB Hi-Fi',
    });
    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'Sony',
        model: 'A95L',
        type: 'electronics',
        assetId: 'TV01',
      })
    );
  });

  it('passes boolean fields', async () => {
    await tool('inventory.items.create').handler({
      itemName: 'Laptop',
      inUse: true,
      deductible: false,
    });
    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({ inUse: true, deductible: false })
    );
  });

  it('passes number fields including zero', async () => {
    await tool('inventory.items.create').handler({
      itemName: 'Cable',
      replacementValue: 0,
      resaleValue: 5.5,
      purchasePrice: 12.99,
    });
    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({ replacementValue: 0, resaleValue: 5.5, purchasePrice: 12.99 })
    );
  });

  it('returns isError when itemName is missing', async () => {
    const result = await tool('inventory.items.create').handler({ brand: 'Sony' });
    expect(result.isError).toBe(true);
    expect(items.create).not.toHaveBeenCalled();
  });

  it('returns isError when itemName is empty string', async () => {
    expect((await tool('inventory.items.create').handler({ itemName: '' })).isError).toBe(true);
  });

  it('returns isError on unavailable', async () => {
    items.create.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('inventory.items.create').handler({ itemName: 'TV' });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.items.update', () => {
  it('updates itemName only', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', itemName: 'MacBook Pro' });
    expect(items.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item_1', data: { itemName: 'MacBook Pro' } })
    );
  });

  it('clears a nullable string field with null', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', notes: null });
    const call = items.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(call.data.notes).toBeNull();
  });

  it('clears a nullable number field with null', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', replacementValue: null });
    const call = items.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(call.data.replacementValue).toBeNull();
  });

  it('does not include absent fields in data', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', itemName: 'MacBook Pro' });
    const call = items.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect('brand' in call.data).toBe(false);
    expect('replacementValue' in call.data).toBe(false);
  });

  it('passes number 0 as valid (not omitted)', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', resaleValue: 0 });
    const call = items.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(call.data.resaleValue).toBe(0);
  });

  it('passes boolean fields correctly', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', inUse: false, deductible: true });
    const call = items.update.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(call.data.inUse).toBe(false);
    expect(call.data.deductible).toBe(true);
  });

  it('returns isError when id is missing', async () => {
    const result = await tool('inventory.items.update').handler({ itemName: 'No ID' });
    expect(result.isError).toBe(true);
    expect(items.update).not.toHaveBeenCalled();
  });

  it('returns isError when id is empty string', async () => {
    expect((await tool('inventory.items.update').handler({ id: '' })).isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    items.update.mockResolvedValueOnce(callContractMismatch('inventory', '1.0.0', '2.0.0'));
    const result = await tool('inventory.items.update').handler({
      id: 'item_1',
      itemName: 'New',
    });
    expect(result.isError).toBe(true);
  });
});

describe('inventory.items.delete', () => {
  it('deletes item by id', async () => {
    const result = await tool('inventory.items.delete').handler({ id: 'item_1' });
    expect(items.delete).toHaveBeenCalledWith({ id: 'item_1' });
    expect(result.isError).toBeUndefined();
    expect((parseResult(result) as { message: string }).message).toBe('Inventory item deleted');
  });

  it('returns isError when id is missing', async () => {
    const result = await tool('inventory.items.delete').handler({});
    expect(result.isError).toBe(true);
    expect(items.delete).not.toHaveBeenCalled();
  });

  it('returns isError when id is empty string', async () => {
    expect((await tool('inventory.items.delete').handler({ id: '' })).isError).toBe(true);
  });
});
