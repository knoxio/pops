/**
 * Integration tests for the `budgets.*` REST surface. Covers CRUD
 * envelopes, the spend/remaining enrichment, the `(category, period)`
 * uniqueness conflict (409), the active filter, pagination, and 404 /
 * 400 mapping.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-budgets-test-'));
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

describe('budgets — happy paths', () => {
  it('creates a budget enriched with spend aggregates and reads it back', async () => {
    const created = await client().budgets.create({
      category: 'Groceries',
      period: 'Monthly',
      amount: 600,
      active: true,
    });
    expect(created.data).toMatchObject({
      category: 'Groceries',
      period: 'Monthly',
      amount: 600,
      active: true,
      spent: 0,
      remaining: 600,
    });
    expect(created.message).toBe('Budget created');

    const fetched = await client().budgets.get(created.data.id);
    expect(fetched.data.category).toBe('Groceries');
  });

  it('leaves remaining null when amount is null', async () => {
    const created = await client().budgets.create({ category: 'Misc' });
    expect(created.data.amount).toBeNull();
    expect(created.data.remaining).toBeNull();
  });

  it('lists, updates, then deletes', async () => {
    const created = await client().budgets.create({ category: 'Fun', amount: 100 });

    const listed = await client().budgets.list();
    expect(listed.pagination.total).toBe(1);

    const updated = await client().budgets.update(created.data.id, { amount: 250 });
    expect(updated.data.amount).toBe(250);
    expect(updated.data.remaining).toBe(250);

    const deleted = await client().budgets.delete(created.data.id);
    expect(deleted.message).toBe('Budget deleted');
    expect((await client().budgets.list()).data).toHaveLength(0);
  });
});

describe('budgets — filters', () => {
  it('filters by active flag', async () => {
    await client().budgets.create({ category: 'Active one', active: true });
    await client().budgets.create({ category: 'Inactive one', active: false });

    const active = await client().budgets.list({ active: 'true' });
    expect(active.data.map((b) => b.category)).toEqual(['Active one']);

    const inactive = await client().budgets.list({ active: 'false' });
    expect(inactive.data.map((b) => b.category)).toEqual(['Inactive one']);
  });
});

describe('budgets — error mapping', () => {
  it('409s a duplicate (category, period)', async () => {
    await client().budgets.create({ category: 'Rent', period: 'Monthly' });
    await expect(
      client().budgets.create({ category: 'Rent', period: 'Monthly' })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('404s unknown get / update / delete', async () => {
    await expect(client().budgets.get('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().budgets.update('nope', { amount: 1 })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().budgets.delete('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('400s an empty category', async () => {
    await expect(client().budgets.create({ category: '' })).rejects.toMatchObject({ status: 400 });
  });
});
