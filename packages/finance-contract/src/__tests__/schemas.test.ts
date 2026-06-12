import { describe, expect, expectTypeOf, it } from 'vitest';

import { FinanceErrorSchema } from '../errors.js';
import { WishListItemSchema } from '../schemas/wish-list-item.js';

import type { z } from 'zod';

import type { FinanceError } from '../errors.js';
import type { WishListItem } from '../types/wish-list-item.js';

describe('@pops/finance-contract round-trip', () => {
  it('WishListItem ↔ WishListItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof WishListItemSchema>>().toEqualTypeOf<WishListItem>();
  });

  it('FinanceError ↔ FinanceErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof FinanceErrorSchema>>().toEqualTypeOf<FinanceError>();
  });

  it('WishListItemSchema accepts a well-formed payload', () => {
    const payload: WishListItem = {
      id: 'wl_1',
      item: 'Espresso machine',
      targetAmount: 80000,
      saved: 12000,
      remainingAmount: 68000,
      priority: 'Soon',
      url: 'https://example.com/espresso',
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
      priority: 'high',
      url: null,
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => WishListItemSchema.parse(bad)).toThrow();
  });

  it('WishListItemSchema rejects a malformed URL', () => {
    const bad: WishListItem = {
      id: 'wl_1',
      item: 'x',
      targetAmount: null,
      saved: null,
      remainingAmount: null,
      priority: null,
      url: 'not-a-url',
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => WishListItemSchema.parse(bad)).toThrow();
  });

  it('WishListItemSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: WishListItem = {
      id: 'wl_1',
      item: 'x',
      targetAmount: null,
      saved: null,
      remainingAmount: null,
      priority: null,
      url: null,
      notes: null,
      lastEditedTime: '12 June 2026',
    };

    expect(() => WishListItemSchema.parse(bad)).toThrow();
  });

  it('FinanceErrorSchema accepts ContractStatus envelope', () => {
    expect(FinanceErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('FinanceErrorSchema accepts a budget-exceeded domain error', () => {
    const err: FinanceError = { kind: 'budget-exceeded', budgetId: 'b_1', overspendCents: 4200 };
    expect(FinanceErrorSchema.parse(err)).toEqual(err);
  });

  it('FinanceErrorSchema rejects an unknown kind', () => {
    expect(() => FinanceErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
