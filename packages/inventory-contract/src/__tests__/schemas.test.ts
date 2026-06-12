import { describe, expect, expectTypeOf, it } from 'vitest';

import { InventoryErrorSchema } from '../errors.js';
import { ItemSchema } from '../schemas/item.js';

import type { z } from 'zod';

import type { InventoryError } from '../errors.js';
import type { Item } from '../types/item.js';

describe('@pops/inventory-contract round-trip', () => {
  it('Item ↔ ItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ItemSchema>>().toEqualTypeOf<Item>();
  });

  it('InventoryError ↔ InventoryErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof InventoryErrorSchema>>().toEqualTypeOf<InventoryError>();
  });

  it('ItemSchema accepts a well-formed payload', () => {
    const payload: Item = {
      id: 'it_1',
      name: 'MacBook Pro',
      location: 'Office shelf',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ItemSchema.parse(payload)).toEqual(payload);
  });

  it('ItemSchema accepts a payload with null location', () => {
    const payload: Item = {
      id: 'it_1',
      name: 'Untitled',
      location: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ItemSchema.parse(payload)).toEqual(payload);
  });

  it('ItemSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: Item = {
      id: 'it_1',
      name: 'x',
      location: null,
      lastEditedTime: '12 June 2026',
    };

    expect(() => ItemSchema.parse(bad)).toThrow();
  });

  it('ItemSchema rejects a missing name', () => {
    const bad = {
      id: 'it_1',
      location: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ItemSchema.parse(bad)).toThrow();
  });

  it('ItemSchema rejects a non-string id', () => {
    const bad = {
      id: 42,
      name: 'x',
      location: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ItemSchema.parse(bad)).toThrow();
  });

  it('InventoryErrorSchema accepts ContractStatus envelope', () => {
    expect(InventoryErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('InventoryErrorSchema accepts an unknown-location domain error', () => {
    const err: InventoryError = { kind: 'unknown-location', locationId: 'loc_1' };
    expect(InventoryErrorSchema.parse(err)).toEqual(err);
  });

  it('InventoryErrorSchema accepts an item-archived domain error', () => {
    const err: InventoryError = { kind: 'item-archived', itemId: 'it_1' };
    expect(InventoryErrorSchema.parse(err)).toEqual(err);
  });

  it('InventoryErrorSchema rejects an unknown kind', () => {
    expect(() => InventoryErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
