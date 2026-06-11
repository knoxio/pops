import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedWishListItem, setupTestContext } from '../../shared/test-utils.js';
import { financeUriHandler, FINANCE_URI_TYPES } from './uri-handler.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('financeUriHandler', () => {
  it('declares wish-list among the owned types', () => {
    expect(FINANCE_URI_TYPES).toContain('wish-list');
  });

  it('returns unknown types as not-found rather than throwing', async () => {
    const result = await financeUriHandler.resolve('not-a-real-type', 'anything');
    expect(result).toEqual({ kind: 'not-found' });
  });

  describe('wish-list', () => {
    it('resolves an existing wish list item to its row', async () => {
      const id = seedWishListItem(db, {
        item: 'MacBook Pro',
        target_amount: 3999,
        saved: 1500,
        priority: 'Needing',
      });

      const result = await financeUriHandler.resolve('wish-list', id);

      expect(result.kind).toBe('object');
      if (result.kind !== 'object') return;
      expect(result.data).toMatchObject({
        id,
        item: 'MacBook Pro',
        targetAmount: 3999,
        saved: 1500,
        priority: 'Needing',
      });
    });

    it('returns not-found for a missing wish list id', async () => {
      const result = await financeUriHandler.resolve('wish-list', 'does-not-exist');
      expect(result).toEqual({ kind: 'not-found' });
    });
  });
});
