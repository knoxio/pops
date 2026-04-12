import { wishList as wishListTable } from '@pops/db-types';
import { TRPCError } from '@trpc/server';
import type { Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDrizzle } from '../../../db.js';
import { createCaller, seedWishListItem, setupTestContext } from '../../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('wishlist.list', () => {
  it('returns empty list when no items exist', async () => {
    const result = await caller.finance.wishlist.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it('returns all items with correct shape', async () => {
    seedWishListItem(db, { item: 'MacBook Pro' });
    seedWishListItem(db, { item: 'AirPods Max' });

    const result = await caller.finance.wishlist.list({});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);

    // Sorted by item name
    expect(result.data[0]!.item).toBe('AirPods Max');
    expect(result.data[1]!.item).toBe('MacBook Pro');
  });

  it('returns camelCase fields', async () => {
    seedWishListItem(db, {
      item: 'MacBook Pro',
      target_amount: 3999,
      saved: 1500,
      last_edited_time: '2025-06-15T10:00:00.000Z',
    });

    const result = await caller.finance.wishlist.list({});
    const wishItem = result.data[0];
    expect(wishItem).toHaveProperty('id');
    expect(wishItem).toHaveProperty('targetAmount', 3999);
    expect(wishItem).toHaveProperty('saved', 1500);
    expect(wishItem).toHaveProperty('remainingAmount');
    expect(wishItem).toHaveProperty('lastEditedTime', '2025-06-15T10:00:00.000Z');
    // No snake_case leaking
    expect(wishItem).not.toHaveProperty('notion_id');
    expect(wishItem).not.toHaveProperty('target_amount');
    expect(wishItem).not.toHaveProperty('last_edited_time');
  });

  it('computes remainingAmount when both targetAmount and saved are set', async () => {
    seedWishListItem(db, { item: 'MacBook Pro', target_amount: 3999, saved: 1500 });

    const result = await caller.finance.wishlist.list({});
    expect(result.data[0]!.remainingAmount).toBe(2499);
  });

  it('returns null remainingAmount when targetAmount is null', async () => {
    seedWishListItem(db, { item: 'MacBook Pro', target_amount: null, saved: 1500 });

    const result = await caller.finance.wishlist.list({});
    expect(result.data[0]!.remainingAmount).toBeNull();
  });

  it('returns null remainingAmount when saved is null', async () => {
    seedWishListItem(db, { item: 'MacBook Pro', target_amount: 3999, saved: null });

    const result = await caller.finance.wishlist.list({});
    expect(result.data[0]!.remainingAmount).toBeNull();
  });

  it('returns null remainingAmount when both are null', async () => {
    seedWishListItem(db, { item: 'MacBook Pro', target_amount: null, saved: null });

    const result = await caller.finance.wishlist.list({});
    expect(result.data[0]!.remainingAmount).toBeNull();
  });

  it('filters by search (case-insensitive LIKE on item)', async () => {
    seedWishListItem(db, { item: 'MacBook Pro' });
    seedWishListItem(db, { item: 'AirPods Max' });
    seedWishListItem(db, { item: 'iPad Mini' });

    const result = await caller.finance.wishlist.list({ search: 'mac' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.item).toBe('MacBook Pro');
    expect(result.pagination.total).toBe(1);
  });

  it('filters by priority', async () => {
    seedWishListItem(db, { item: 'MacBook Pro', priority: 'Needing' });
    seedWishListItem(db, { item: 'AirPods Max', priority: 'Dreaming' });

    const result = await caller.finance.wishlist.list({ priority: 'Dreaming' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.item).toBe('AirPods Max');
  });

  it('combines search and priority filters', async () => {
    seedWishListItem(db, { item: 'MacBook Pro', priority: 'Needing' });
    seedWishListItem(db, { item: 'MacBook Air', priority: 'Dreaming' });
    seedWishListItem(db, { item: 'AirPods Max', priority: 'Needing' });

    const result = await caller.finance.wishlist.list({ search: 'macbook', priority: 'Needing' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.item).toBe('MacBook Pro');
  });

  it('paginates with limit and offset', async () => {
    for (let i = 0; i < 10; i++) {
      seedWishListItem(db, { item: `Item ${String(i).padStart(2, '0')}` });
    }

    const page1 = await caller.finance.wishlist.list({ limit: 3, offset: 0 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pagination).toEqual({
      total: 10,
      limit: 3,
      offset: 0,
      hasMore: true,
    });

    const page2 = await caller.finance.wishlist.list({ limit: 3, offset: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.pagination.offset).toBe(3);

    // Names should not overlap
    const page1Items = page1.data.map((e) => e.item);
    const page2Items = page2.data.map((e) => e.item);
    expect(page1Items).not.toEqual(page2Items);
  });

  it('defaults limit to 50 and offset to 0', async () => {
    const result = await caller.finance.wishlist.list({});
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.offset).toBe(0);
  });

  it('throws UNAUTHORIZED without auth', async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.finance.wishlist.list({})).rejects.toThrow(TRPCError);
    await expect(unauthCaller.finance.wishlist.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('wishlist.get', () => {
  it('returns a single item by ID', async () => {
    const id = seedWishListItem(db, { item: 'MacBook Pro', target_amount: 3999, saved: 1500 });

    const result = await caller.finance.wishlist.get({ id });
    expect(result.data.id).toBe(id);
    expect(result.data.item).toBe('MacBook Pro');
    expect(result.data.targetAmount).toBe(3999);
    expect(result.data.saved).toBe(1500);
    expect(result.data.remainingAmount).toBe(2499);
  });

  it('throws NOT_FOUND for non-existent ID', async () => {
    await expect(caller.finance.wishlist.get({ id: 'does-not-exist' })).rejects.toThrow(TRPCError);
    await expect(caller.finance.wishlist.get({ id: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('wishlist.create', () => {
  it('creates an item with required fields only', async () => {
    const result = await caller.finance.wishlist.create({ item: 'MacBook Pro' });

    expect(result.message).toBe('Wish list item created');
    expect(result.data.item).toBe('MacBook Pro');
    expect(result.data.id).toBeDefined();
    expect(result.data.targetAmount).toBeNull();
    expect(result.data.saved).toBeNull();
    expect(result.data.remainingAmount).toBeNull();
    expect(result.data.priority).toBeNull();
    expect(result.data.url).toBeNull();
    expect(result.data.notes).toBeNull();
  });

  it('creates an item with all fields', async () => {
    const result = await caller.finance.wishlist.create({
      item: 'MacBook Pro',
      targetAmount: 3999,
      saved: 1500,
      priority: 'Needing',
      url: 'https://apple.com/macbook-pro',
      notes: 'M4 Max, 36GB RAM',
    });

    expect(result.data.item).toBe('MacBook Pro');
    expect(result.data.targetAmount).toBe(3999);
    expect(result.data.saved).toBe(1500);
    expect(result.data.remainingAmount).toBe(2499);
    expect(result.data.priority).toBe('Needing');
    expect(result.data.url).toBe('https://apple.com/macbook-pro');
    expect(result.data.notes).toBe('M4 Max, 36GB RAM');
  });

  it('rejects missing item field', async () => {
    // @ts-expect-error - Testing validation with missing required field
    await expect(caller.finance.wishlist.create({})).rejects.toThrow(TRPCError);
    // @ts-expect-error - Testing validation with missing required field
    await expect(caller.finance.wishlist.create({})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects empty item field', async () => {
    await expect(caller.finance.wishlist.create({ item: '' })).rejects.toThrow(TRPCError);
    await expect(caller.finance.wishlist.create({ item: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects invalid priority value', async () => {
    await expect(
      // @ts-expect-error - Testing validation with invalid priority
      caller.finance.wishlist.create({ item: 'Test', priority: 'Invalid' })
    ).rejects.toThrow(TRPCError);
    await expect(
      // @ts-expect-error - Testing validation with invalid priority
      caller.finance.wishlist.create({ item: 'Test', priority: 'Invalid' })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects invalid URL', async () => {
    await expect(
      caller.finance.wishlist.create({ item: 'Test', url: 'not-a-url' })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.wishlist.create({ item: 'Test', url: 'not-a-url' })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('persists to the database', async () => {
    await caller.finance.wishlist.create({ item: 'New Item' });

    const row = getDrizzle()
      .select()
      .from(wishListTable)
      .where(eq(wishListTable.item, 'New Item'))
      .get();
    expect(row).toBeDefined();
  });

  it('accepts all valid priority values', async () => {
    const priorities = ['Needing', 'Soon', 'One Day', 'Dreaming'] as const;
    for (const priority of priorities) {
      const result = await caller.finance.wishlist.create({
        item: `Item ${priority}`,
        priority,
      });
      expect(result.data.priority).toBe(priority);
    }
  });
});

describe('wishlist.update', () => {
  it('updates a single field', async () => {
    const id = seedWishListItem(db, { item: 'MacBook Pro' });

    const result = await caller.finance.wishlist.update({ id, data: { priority: 'Needing' } });

    expect(result.message).toBe('Wish list item updated');
    expect(result.data.item).toBe('MacBook Pro');
    expect(result.data.priority).toBe('Needing');
  });

  it('updates multiple fields at once', async () => {
    const id = seedWishListItem(db, { item: 'MacBook Pro' });

    const result = await caller.finance.wishlist.update({
      id,
      data: {
        item: 'MacBook Pro M4',
        targetAmount: 4999,
        saved: 2000,
        priority: 'Soon',
      },
    });

    expect(result.data.item).toBe('MacBook Pro M4');
    expect(result.data.targetAmount).toBe(4999);
    expect(result.data.saved).toBe(2000);
    expect(result.data.priority).toBe('Soon');
    expect(result.data.remainingAmount).toBe(2999);
  });

  it('clears a field by setting to null', async () => {
    const id = seedWishListItem(db, { item: 'MacBook Pro', priority: 'Needing' });

    const result = await caller.finance.wishlist.update({ id, data: { priority: null } });

    expect(result.data.priority).toBeNull();
  });

  it('updates last_edited_time', async () => {
    const id = seedWishListItem(db, {
      item: 'MacBook Pro',
      last_edited_time: '2020-01-01T00:00:00.000Z',
    });

    await caller.finance.wishlist.update({ id, data: { priority: 'Needing' } });

    const row = getDrizzle()
      .select({ lastEditedTime: wishListTable.lastEditedTime })
      .from(wishListTable)
      .where(eq(wishListTable.id, id))
      .get();
    expect(row!.lastEditedTime).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('throws NOT_FOUND for non-existent ID', async () => {
    await expect(
      caller.finance.wishlist.update({
        id: 'does-not-exist',
        data: { item: 'New Name' },
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.wishlist.update({
        id: 'does-not-exist',
        data: { item: 'New Name' },
      })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects empty item', async () => {
    const id = seedWishListItem(db, { item: 'MacBook Pro' });

    await expect(caller.finance.wishlist.update({ id, data: { item: '' } })).rejects.toThrow(
      TRPCError
    );
    await expect(caller.finance.wishlist.update({ id, data: { item: '' } })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects invalid priority on update', async () => {
    const id = seedWishListItem(db, { item: 'MacBook Pro' });

    await expect(
      // @ts-expect-error - Testing validation with invalid priority
      caller.finance.wishlist.update({ id, data: { priority: 'Invalid' } })
    ).rejects.toThrow(TRPCError);
    await expect(
      // @ts-expect-error - Testing validation with invalid priority
      caller.finance.wishlist.update({ id, data: { priority: 'Invalid' } })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('wishlist.delete', () => {
  it('deletes an existing item', async () => {
    const id = seedWishListItem(db, { item: 'MacBook Pro' });

    const result = await caller.finance.wishlist.delete({ id });
    expect(result.message).toBe('Wish list item deleted');

    // Verify gone from DB
    const row = getDrizzle().select().from(wishListTable).where(eq(wishListTable.id, id)).get();
    expect(row).toBeUndefined();
  });

  it('throws NOT_FOUND for non-existent ID', async () => {
    await expect(caller.finance.wishlist.delete({ id: 'does-not-exist' })).rejects.toThrow(
      TRPCError
    );
    await expect(caller.finance.wishlist.delete({ id: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('is idempotent — second delete throws NOT_FOUND', async () => {
    const id = seedWishListItem(db, { item: 'MacBook Pro' });

    await caller.finance.wishlist.delete({ id });
    await expect(caller.finance.wishlist.delete({ id })).rejects.toThrow(TRPCError);
    await expect(caller.finance.wishlist.delete({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('computed remainingAmount', () => {
  it('computes correctly with positive values', async () => {
    const id = seedWishListItem(db, { item: 'Test', target_amount: 1000, saved: 250 });

    const result = await caller.finance.wishlist.get({ id });
    expect(result.data.remainingAmount).toBe(750);
  });

  it('returns negative when saved exceeds target', async () => {
    const id = seedWishListItem(db, { item: 'Test', target_amount: 100, saved: 200 });

    const result = await caller.finance.wishlist.get({ id });
    expect(result.data.remainingAmount).toBe(-100);
  });

  it('returns zero when fully saved', async () => {
    const id = seedWishListItem(db, { item: 'Test', target_amount: 500, saved: 500 });

    const result = await caller.finance.wishlist.get({ id });
    expect(result.data.remainingAmount).toBe(0);
  });
});
