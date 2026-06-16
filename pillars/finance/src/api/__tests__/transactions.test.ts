/**
 * Integration tests for the `transactions.*` REST surface. Covers the
 * CRUD envelopes, JSON tag parsing on the wire, the delete→restore (Undo)
 * handshake including the duplicate-restore conflict, filter combinations,
 * pagination, and error-status mapping.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-tx-test-'));
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

const base = {
  description: 'Coffee',
  account: 'Everyday',
  amount: -4.5,
  date: '2026-01-02',
  type: 'expense',
};

describe('transactions — happy paths', () => {
  it('creates with tags, parses them to an array on read, and lists', async () => {
    const created = await client().transactions.create({ ...base, tags: ['food', 'coffee'] });
    expect(created.data.tags).toEqual(['food', 'coffee']);
    expect(created.data.amount).toBe(-4.5);

    const fetched = await client().transactions.get(created.data.id);
    expect(fetched.data).toMatchObject({ description: 'Coffee', account: 'Everyday' });

    const listed = await client().transactions.list();
    expect(listed.pagination.total).toBe(1);
    expect(listed.data[0]?.tags).toEqual(['food', 'coffee']);
  });

  it('updates fields', async () => {
    const created = await client().transactions.create(base);
    const updated = await client().transactions.update(created.data.id, {
      description: 'Latte',
      tags: ['coffee'],
    });
    expect(updated.data.description).toBe('Latte');
    expect(updated.data.tags).toEqual(['coffee']);
  });
});

describe('transactions — delete / restore handshake', () => {
  it('delete returns a raw snapshot; restore re-creates; a second restore conflicts', async () => {
    const created = await client().transactions.create({ ...base, tags: ['food'] });
    const id = created.data.id;

    const deleted = await client().transactions.delete(id);
    expect(deleted.snapshot.id).toBe(id);
    // Snapshot carries the RAW tags JSON string, not the parsed array.
    expect(typeof deleted.snapshot.tags).toBe('string');
    await expect(client().transactions.get(id)).rejects.toMatchObject({ status: 404 });

    const restored = await client().transactions.restore(deleted.snapshot);
    expect(restored.data.id).toBe(id);
    expect(restored.data.tags).toEqual(['food']);

    // Restoring the same snapshot again must conflict — the id now exists.
    await expect(client().transactions.restore(deleted.snapshot)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('transactions — filters & pagination', () => {
  beforeEach(async () => {
    await client().transactions.create({
      ...base,
      account: 'Everyday',
      type: 'expense',
      date: '2026-01-01',
    });
    await client().transactions.create({
      ...base,
      description: 'Salary',
      account: 'Savings',
      type: 'income',
      amount: 5000,
      date: '2026-02-01',
    });
    await client().transactions.create({
      ...base,
      description: 'Rent',
      account: 'Everyday',
      type: 'expense',
      amount: -1500,
      date: '2026-02-15',
    });
  });

  it('filters by account and by type', async () => {
    const everyday = await client().transactions.list({ account: 'Everyday' });
    expect(everyday.pagination.total).toBe(2);

    const income = await client().transactions.list({ type: 'income' });
    expect(income.data.map((t) => t.description)).toEqual(['Salary']);
  });

  it('paginates with limit/offset', async () => {
    const page = await client().transactions.list({ limit: 2, offset: 0 });
    expect(page.data).toHaveLength(2);
    expect(page.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });
  });
});

describe('transactions — error mapping', () => {
  it('404s unknown get / update / delete', async () => {
    await expect(client().transactions.get('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().transactions.update('nope', { notes: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().transactions.delete('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('400s a create missing required fields', async () => {
    await expect(client().transactions.create({ description: '' })).rejects.toMatchObject({
      status: 400,
    });
  });
});
