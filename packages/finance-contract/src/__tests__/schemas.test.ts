import { describe, expect, expectTypeOf, it } from 'vitest';

import { WishListItemSchema } from '../schemas/wish-list-item.js';

import type { z } from 'zod';

import type { WishListItem } from '../types/wish-list-item.js';

describe('@pops/finance-contract round-trip', () => {
  it('WishListItem ↔ WishListItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof WishListItemSchema>>().toEqualTypeOf<WishListItem>();
  });

  it('WishListItemSchema accepts a well-formed payload', () => {
    const payload: WishListItem = {
      id: 'wl_1',
      item: 'Espresso machine',
      targetAmount: 80000,
      saved: 12000,
      remainingAmount: 68000,
      priority: 'high',
      url: null,
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(WishListItemSchema.parse(payload)).toEqual(payload);
  });

  it('WishListItemSchema rejects an unknown priority', () => {
    const bad = {
      id: 'wl_1',
      item: 'x',
      targetAmount: null,
      saved: null,
      remainingAmount: null,
      priority: 'urgent',
      url: null,
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => WishListItemSchema.parse(bad)).toThrow();
  });
});
