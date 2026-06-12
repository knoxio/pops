import { describe, expect, expectTypeOf, it } from 'vitest';

import { FinanceErrorSchema } from '../errors.js';
import { BudgetSchema } from '../schemas/budget.js';
import { EntitySchema } from '../schemas/entity.js';
import { TransactionSchema } from '../schemas/transaction.js';
import { WishListItemSchema } from '../schemas/wish-list-item.js';

import type { z } from 'zod';

import type { FinanceError } from '../errors.js';
import type { Budget } from '../types/budget.js';
import type { Entity } from '../types/entity.js';
import type { Transaction } from '../types/transaction.js';
import type { WishListItem } from '../types/wish-list-item.js';

describe('@pops/finance-contract round-trip', () => {
  it('WishListItem ↔ WishListItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof WishListItemSchema>>().toEqualTypeOf<WishListItem>();
  });

  it('Transaction ↔ TransactionSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof TransactionSchema>>().toEqualTypeOf<Transaction>();
  });

  it('Budget ↔ BudgetSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof BudgetSchema>>().toEqualTypeOf<Budget>();
  });

  it('Entity ↔ EntitySchema agree structurally', () => {
    expectTypeOf<z.infer<typeof EntitySchema>>().toEqualTypeOf<Entity>();
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

  it('TransactionSchema accepts a well-formed payload', () => {
    const payload: Transaction = {
      id: 'tx_1',
      description: 'Coffee',
      amount: -550,
      date: '2026-06-12T08:30:00.000Z',
      entityId: 'ent_42',
      tagIds: ['tag_food', 'tag_coffee'],
      lastEditedTime: '2026-06-12T08:31:00.000Z',
    };

    expect(TransactionSchema.parse(payload)).toEqual(payload);
  });

  it('TransactionSchema accepts a null entityId and an empty tagIds array', () => {
    const payload: Transaction = {
      id: 'tx_2',
      description: 'Untagged',
      amount: 100,
      date: '2026-06-12T00:00:00.000Z',
      entityId: null,
      tagIds: [],
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(TransactionSchema.parse(payload)).toEqual(payload);
  });

  it('TransactionSchema rejects a non-numeric amount', () => {
    const bad = {
      id: 'tx_1',
      description: 'x',
      amount: '5.50',
      date: '2026-06-12T00:00:00.000Z',
      entityId: null,
      tagIds: [],
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => TransactionSchema.parse(bad)).toThrow();
  });

  it('TransactionSchema rejects a non-ISO-8601 date', () => {
    const bad = {
      id: 'tx_1',
      description: 'x',
      amount: 1,
      date: '12 June 2026',
      entityId: null,
      tagIds: [],
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => TransactionSchema.parse(bad)).toThrow();
  });

  it('TransactionSchema rejects a non-string tagId', () => {
    const bad = {
      id: 'tx_1',
      description: 'x',
      amount: 1,
      date: '2026-06-12T00:00:00.000Z',
      entityId: null,
      tagIds: ['tag_food', 42],
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => TransactionSchema.parse(bad)).toThrow();
  });

  it('BudgetSchema accepts a well-formed monthly payload', () => {
    const payload: Budget = {
      id: 'b_1',
      name: 'Groceries',
      cap: 60000,
      period: 'monthly',
      categoryId: 'cat_groceries',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(BudgetSchema.parse(payload)).toEqual(payload);
  });

  it('BudgetSchema accepts a yearly payload with a null categoryId', () => {
    const payload: Budget = {
      id: 'b_2',
      name: 'Travel',
      cap: 500000,
      period: 'yearly',
      categoryId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(BudgetSchema.parse(payload)).toEqual(payload);
  });

  it('BudgetSchema rejects an unknown period', () => {
    const bad = {
      id: 'b_1',
      name: 'x',
      cap: 1,
      period: 'weekly',
      categoryId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => BudgetSchema.parse(bad)).toThrow();
  });

  it('BudgetSchema rejects a negative cap', () => {
    const bad = {
      id: 'b_1',
      name: 'x',
      cap: -1,
      period: 'monthly',
      categoryId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => BudgetSchema.parse(bad)).toThrow();
  });

  it('EntitySchema accepts a well-formed payload', () => {
    const payload: Entity = {
      id: 'ent_1',
      name: 'Acme Pty Ltd',
      aliases: ['ACME', 'Acme Australia'],
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(EntitySchema.parse(payload)).toEqual(payload);
  });

  it('EntitySchema accepts an empty aliases array', () => {
    const payload: Entity = {
      id: 'ent_2',
      name: 'Solo',
      aliases: [],
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(EntitySchema.parse(payload)).toEqual(payload);
  });

  it('EntitySchema rejects a non-string alias', () => {
    const bad = {
      id: 'ent_1',
      name: 'x',
      aliases: ['fine', 42],
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => EntitySchema.parse(bad)).toThrow();
  });

  it('EntitySchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad = {
      id: 'ent_1',
      name: 'x',
      aliases: [],
      lastEditedTime: 'yesterday',
    };

    expect(() => EntitySchema.parse(bad)).toThrow();
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
