import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockClient, parseResult } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

const { itemTools } = await import('./inventory-items.js');

function tool(name: string) {
  const t = itemTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

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
    expect(mockClient.inventory.items.list.query).toHaveBeenCalledWith(
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
    const call = mockClient.inventory.items.list.query.mock.lastCall?.[0];
    for (const value of Object.values(call as Record<string, unknown>)) {
      expect(value).not.toBeNull();
    }
  });
});

describe('inventory.items.get', () => {
  it('passes id to tRPC and returns item', async () => {
    const result = await tool('inventory.items.get').handler({ id: 'item_1' });
    expect(mockClient.inventory.items.get.query).toHaveBeenCalledWith({ id: 'item_1' });
    const parsed = parseResult(result) as { itemName: string };
    expect(parsed.itemName).toBe('MacBook');
  });

  it('returns isError for missing id', async () => {
    expect((await tool('inventory.items.get').handler({})).isError).toBe(true);
  });

  it('returns isError for empty id', async () => {
    expect((await tool('inventory.items.get').handler({ id: '' })).isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe('inventory.items.create', () => {
  it('creates with only itemName', async () => {
    const result = await tool('inventory.items.create').handler({ itemName: 'Sony TV' });
    expect(mockClient.inventory.items.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ itemName: 'Sony TV' })
    );
    expect(result.isError).toBeUndefined();
    expect((parseResult(result) as { id: string }).id).toBe('item_1');
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
    expect(mockClient.inventory.items.create.mutate).toHaveBeenCalledWith(
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
    expect(mockClient.inventory.items.create.mutate).toHaveBeenCalledWith(
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
    expect(mockClient.inventory.items.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ replacementValue: 0, resaleValue: 5.5, purchasePrice: 12.99 })
    );
  });

  it('returns isError when itemName is missing', async () => {
    const result = await tool('inventory.items.create').handler({ brand: 'Sony' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.items.create.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when itemName is empty string', async () => {
    expect((await tool('inventory.items.create').handler({ itemName: '' })).isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

describe('inventory.items.update', () => {
  it('updates itemName only', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', itemName: 'MacBook Pro' });
    expect(mockClient.inventory.items.update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item_1', data: { itemName: 'MacBook Pro' } })
    );
  });

  it('clears a nullable string field with null', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', notes: null });
    const call = mockClient.inventory.items.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.notes).toBeNull();
  });

  it('clears a nullable number field with null', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', replacementValue: null });
    const call = mockClient.inventory.items.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.replacementValue).toBeNull();
  });

  it('does not include absent fields in data', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', itemName: 'MacBook Pro' });
    const call = mockClient.inventory.items.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect('brand' in call.data).toBe(false);
    expect('replacementValue' in call.data).toBe(false);
  });

  it('passes number 0 as valid (not omitted)', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', resaleValue: 0 });
    const call = mockClient.inventory.items.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.resaleValue).toBe(0);
  });

  it('passes boolean fields correctly', async () => {
    await tool('inventory.items.update').handler({ id: 'item_1', inUse: false, deductible: true });
    const call = mockClient.inventory.items.update.mutate.mock.lastCall?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.inUse).toBe(false);
    expect(call.data.deductible).toBe(true);
  });

  it('returns isError when id is missing', async () => {
    const result = await tool('inventory.items.update').handler({ itemName: 'No ID' });
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.items.update.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when id is empty string', async () => {
    expect((await tool('inventory.items.update').handler({ id: '' })).isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('inventory.items.delete', () => {
  it('deletes item by id', async () => {
    const result = await tool('inventory.items.delete').handler({ id: 'item_1' });
    expect(mockClient.inventory.items.delete.mutate).toHaveBeenCalledWith({ id: 'item_1' });
    expect(result.isError).toBeUndefined();
    expect((parseResult(result) as { message: string }).message).toBe('Inventory item deleted');
  });

  it('returns isError when id is missing', async () => {
    const result = await tool('inventory.items.delete').handler({});
    expect(result.isError).toBe(true);
    expect(mockClient.inventory.items.delete.mutate).not.toHaveBeenCalled();
  });

  it('returns isError when id is empty string', async () => {
    expect((await tool('inventory.items.delete').handler({ id: '' })).isError).toBe(true);
  });
});
