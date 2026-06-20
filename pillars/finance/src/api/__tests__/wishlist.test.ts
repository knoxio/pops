/**
 * Integration tests for the `wishlist.*` REST surface, driven through the
 * real Express app via supertest. Service-layer invariants are covered in
 * the db package tests; this suite focuses on the wire contract: envelope
 * shapes, computed fields, error-status mapping, the unknown-priority
 * short-circuit, and pagination metadata.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-wishlist-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({ financeDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3004' })
  );
}

describe('wishlist — happy paths', () => {
  it('creates an item, computes remainingAmount, and reads it back', async () => {
    const created = await client().wishlist.create({
      item: 'Standing desk',
      targetAmount: 800,
      saved: 300,
      priority: 'Soon',
      url: 'https://example.com/desk',
      notes: 'electric',
    });
    expect(created.data.id).toBeTruthy();
    expect(created.data.remainingAmount).toBe(500);
    expect(created.message).toBe('Wish list item created');

    const fetched = await client().wishlist.get(created.data.id);
    expect(fetched.data).toMatchObject({ item: 'Standing desk', priority: 'Soon', saved: 300 });
  });

  it('leaves remainingAmount null when either amount is null', async () => {
    const created = await client().wishlist.create({ item: 'Surprise', targetAmount: null });
    expect(created.data.remainingAmount).toBeNull();
  });

  it('lists, updates, then deletes an item', async () => {
    const created = await client().wishlist.create({ item: 'Headphones', targetAmount: 200 });

    const listed = await client().wishlist.list();
    expect(listed.data.map((w) => w.item)).toContain('Headphones');
    expect(listed.pagination.total).toBe(1);

    const updated = await client().wishlist.update(created.data.id, { saved: 200 });
    expect(updated.data.remainingAmount).toBe(0);

    const deleted = await client().wishlist.delete(created.data.id);
    expect(deleted.message).toBe('Wish list item deleted');

    const after = await client().wishlist.list();
    expect(after.data).toHaveLength(0);
  });
});

describe('wishlist — filters & pagination', () => {
  it('filters by a known priority and short-circuits an unknown one to an empty page', async () => {
    await client().wishlist.create({ item: 'A', priority: 'Needing' });
    await client().wishlist.create({ item: 'B', priority: 'Dreaming' });

    const needing = await client().wishlist.list({ priority: 'Needing' });
    expect(needing.data.map((w) => w.item)).toEqual(['A']);

    // Unknown priority must return zero rows, NOT all rows (pre-pillar semantic).
    const unknown = await client().wishlist.list({ priority: 'Whenever' });
    expect(unknown.data).toHaveLength(0);
    expect(unknown.pagination.total).toBe(0);
  });

  it('honours limit/offset and reports hasMore', async () => {
    for (const item of ['a', 'b', 'c']) {
      await client().wishlist.create({ item });
    }
    const page = await client().wishlist.list({ limit: 2, offset: 0 });
    expect(page.data).toHaveLength(2);
    expect(page.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });

    const last = await client().wishlist.list({ limit: 2, offset: 2 });
    expect(last.data).toHaveLength(1);
    expect(last.pagination.hasMore).toBe(false);
  });
});

describe('wishlist — error mapping', () => {
  it('404s an unknown get / update / delete', async () => {
    await expect(client().wishlist.get('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().wishlist.update('nope', { item: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().wishlist.delete('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('400s an empty item at the contract boundary', async () => {
    await expect(client().wishlist.create({ item: '' })).rejects.toMatchObject({ status: 400 });
  });

  it('400s an invalid url', async () => {
    await expect(
      client().wishlist.create({ item: 'Bad link', url: 'not-a-url' })
    ).rejects.toMatchObject({ status: 400 });
  });
});
