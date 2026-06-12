import { describe, expect, expectTypeOf, it } from 'vitest';

import { InventoryErrorSchema } from '../errors.js';
import { ConnectionSchema } from '../schemas/connection.js';
import { ItemSchema } from '../schemas/item.js';
import { LocationSchema } from '../schemas/location.js';
import { WarrantySchema } from '../schemas/warranty.js';

import type { z } from 'zod';

import type { InventoryError } from '../errors.js';
import type { Connection } from '../types/connection.js';
import type { Item } from '../types/item.js';
import type { Location } from '../types/location.js';
import type { Warranty } from '../types/warranty.js';

describe('@pops/inventory-contract round-trip', () => {
  it('Item ↔ ItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ItemSchema>>().toEqualTypeOf<Item>();
  });

  it('Location ↔ LocationSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof LocationSchema>>().toEqualTypeOf<Location>();
  });

  it('Warranty ↔ WarrantySchema agree structurally', () => {
    expectTypeOf<z.infer<typeof WarrantySchema>>().toEqualTypeOf<Warranty>();
  });

  it('Connection ↔ ConnectionSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ConnectionSchema>>().toEqualTypeOf<Connection>();
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

  it('LocationSchema accepts a well-formed root payload', () => {
    const payload: Location = {
      id: 'loc_1',
      name: 'Office',
      parentId: null,
      sortIndex: 0,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(LocationSchema.parse(payload)).toEqual(payload);
  });

  it('LocationSchema accepts a nested child payload', () => {
    const payload: Location = {
      id: 'loc_2',
      name: 'Top Shelf',
      parentId: 'loc_1',
      sortIndex: 3,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(LocationSchema.parse(payload)).toEqual(payload);
  });

  it('LocationSchema rejects a negative sortIndex', () => {
    const bad = {
      id: 'loc_1',
      name: 'x',
      parentId: null,
      sortIndex: -1,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => LocationSchema.parse(bad)).toThrow();
  });

  it('LocationSchema rejects a non-integer sortIndex', () => {
    const bad = {
      id: 'loc_1',
      name: 'x',
      parentId: null,
      sortIndex: 1.5,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => LocationSchema.parse(bad)).toThrow();
  });

  it('LocationSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad = {
      id: 'loc_1',
      name: 'x',
      parentId: null,
      sortIndex: 0,
      lastEditedTime: '12 June 2026',
    };

    expect(() => LocationSchema.parse(bad)).toThrow();
  });

  it('WarrantySchema accepts a well-formed payload', () => {
    const payload: Warranty = {
      id: 'wty_1',
      itemId: 'it_1',
      expiresAt: '2027-06-12T00:00:00.000Z',
      provider: 'Apple',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(WarrantySchema.parse(payload)).toEqual(payload);
  });

  it('WarrantySchema accepts a payload with a null provider', () => {
    const payload: Warranty = {
      id: 'wty_2',
      itemId: 'it_2',
      expiresAt: '2027-06-12T00:00:00.000Z',
      provider: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(WarrantySchema.parse(payload)).toEqual(payload);
  });

  it('WarrantySchema rejects a non-ISO-8601 expiresAt', () => {
    const bad = {
      id: 'wty_1',
      itemId: 'it_1',
      expiresAt: 'next June',
      provider: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => WarrantySchema.parse(bad)).toThrow();
  });

  it('WarrantySchema rejects a missing itemId', () => {
    const bad = {
      id: 'wty_1',
      expiresAt: '2027-06-12T00:00:00.000Z',
      provider: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => WarrantySchema.parse(bad)).toThrow();
  });

  it('ConnectionSchema accepts a well-formed enabled payload', () => {
    const payload: Connection = {
      id: 'cn_1',
      name: 'Paperless',
      type: 'paperless',
      enabled: true,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ConnectionSchema.parse(payload)).toEqual(payload);
  });

  it('ConnectionSchema accepts a disabled payload', () => {
    const payload: Connection = {
      id: 'cn_2',
      name: 'Snipe-IT',
      type: 'snipe-it',
      enabled: false,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ConnectionSchema.parse(payload)).toEqual(payload);
  });

  it('ConnectionSchema rejects a non-boolean enabled', () => {
    const bad = {
      id: 'cn_1',
      name: 'x',
      type: 'x',
      enabled: 'yes',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ConnectionSchema.parse(bad)).toThrow();
  });

  it('ConnectionSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad = {
      id: 'cn_1',
      name: 'x',
      type: 'x',
      enabled: true,
      lastEditedTime: 'yesterday',
    };

    expect(() => ConnectionSchema.parse(bad)).toThrow();
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
