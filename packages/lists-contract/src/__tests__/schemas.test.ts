import { describe, expect, expectTypeOf, it } from 'vitest';

import { ListsErrorSchema } from '../errors.js';
import { ListItemSchema } from '../schemas/list-item.js';

import type { z } from 'zod';

import type { ListsError } from '../errors.js';
import type { ListItem } from '../types/list-item.js';

describe('@pops/lists-contract round-trip', () => {
  it('ListItem ↔ ListItemSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ListItemSchema>>().toEqualTypeOf<ListItem>();
  });

  it('ListsError ↔ ListsErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ListsErrorSchema>>().toEqualTypeOf<ListsError>();
  });

  it('ListItemSchema accepts a well-formed payload', () => {
    const payload: ListItem = {
      id: 'li_1',
      name: 'Buy milk',
      completed: false,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ListItemSchema.parse(payload)).toEqual(payload);
  });

  it('ListItemSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: ListItem = {
      id: 'li_1',
      name: 'x',
      completed: false,
      lastEditedTime: '12 June 2026',
    };

    expect(() => ListItemSchema.parse(bad)).toThrow();
  });

  it('ListItemSchema rejects a missing name', () => {
    const bad = {
      id: 'li_1',
      completed: false,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ListItemSchema.parse(bad)).toThrow();
  });

  it('ListItemSchema rejects a non-boolean completed', () => {
    const bad = {
      id: 'li_1',
      name: 'x',
      completed: 'yes',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ListItemSchema.parse(bad)).toThrow();
  });

  it('ListItemSchema rejects a non-string id', () => {
    const bad = {
      id: 42,
      name: 'x',
      completed: false,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ListItemSchema.parse(bad)).toThrow();
  });

  it('ListsErrorSchema accepts ContractStatus envelope', () => {
    expect(ListsErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('ListsErrorSchema accepts an unknown-list-item domain error', () => {
    const err: ListsError = { kind: 'unknown-list-item', listItemId: 'li_1' };
    expect(ListsErrorSchema.parse(err)).toEqual(err);
  });

  it('ListsErrorSchema accepts a list-item-archived domain error', () => {
    const err: ListsError = { kind: 'list-item-archived', listItemId: 'li_1' };
    expect(ListsErrorSchema.parse(err)).toEqual(err);
  });

  it('ListsErrorSchema rejects an unknown kind', () => {
    expect(() => ListsErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
