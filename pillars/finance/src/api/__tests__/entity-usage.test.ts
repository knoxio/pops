/**
 * Integration tests for the `entityUsage.*` REST surface — contacts enriched
 * with a per-entity `transactionCount`, computed by joining the live contact
 * set (fetched from the contacts pillar) against finance `transactions.entityId`
 * IN MEMORY. The contact set is provided by an injected fake; transactions are
 * seeded directly into the finance db.
 *
 * Covers the transactionCount rollup, orphanedOnly / search / type filters,
 * pagination, the aliases/defaultTags projection, and contacts-down degradation.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, transactionsService, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake, type ContactsFake, type SeedContact } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-entity-usage-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(contacts: ContactsFake) {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts,
    })
  );
}

function seedTxn(entityId: string, description: string, date: string): void {
  transactionsService.createTransaction(financeDb.db, {
    description,
    account: 'checking',
    amount: -10,
    date,
    entityId,
  });
}

const SEED: SeedContact[] = [
  {
    id: 'ent-alpha',
    name: 'Alpha',
    type: 'company',
    aliases: ['Alpha Co', 'ALP'],
    defaultTags: ['groceries'],
  },
  { id: 'ent-bravo', name: 'Bravo', type: 'person' },
  { id: 'ent-charlie', name: 'Charlie', type: 'company' },
];

function fakeWithSeed(): ContactsFake {
  return makeContactsFake({ seed: SEED });
}

beforeEach(() => {
  seedTxn('ent-alpha', 'ALPHA STORE 1', '2026-01-01');
  seedTxn('ent-alpha', 'ALPHA STORE 2', '2026-01-02');
  seedTxn('ent-charlie', 'CHARLIE CAFE', '2026-01-03');
});

describe('entityUsage — transactionCount rollup over the live contact set', () => {
  it('lists every contact with its transactionCount, ordered by name', async () => {
    const { data, pagination } = await client(fakeWithSeed()).entityUsage.list();
    expect(data.map((e) => e.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    const counts = new Map(data.map((e) => [e.name, e.transactionCount]));
    expect(counts.get('Alpha')).toBe(2);
    expect(counts.get('Bravo')).toBe(0);
    expect(counts.get('Charlie')).toBe(1);
    expect(pagination.total).toBe(3);
  });

  it('orphanedOnly=true returns only contacts with zero transactions', async () => {
    const { data, pagination } = await client(fakeWithSeed()).entityUsage.list({
      orphanedOnly: 'true',
    });
    expect(data.map((e) => e.name)).toEqual(['Bravo']);
    expect(data[0]?.transactionCount).toBe(0);
    expect(pagination.total).toBe(1);
  });

  it('orphanedOnly=false returns all contacts (count===0 not filtered)', async () => {
    const { data } = await client(fakeWithSeed()).entityUsage.list({ orphanedOnly: 'false' });
    expect(data).toHaveLength(3);
  });

  it('filters by search (name substring) via the contacts fetch', async () => {
    const { data } = await client(fakeWithSeed()).entityUsage.list({ search: 'lph' });
    expect(data.map((e) => e.name)).toEqual(['Alpha']);
    expect(data[0]?.transactionCount).toBe(2);
  });

  it('filters by type via the contacts fetch', async () => {
    const { data } = await client(fakeWithSeed()).entityUsage.list({ type: 'company' });
    expect(data.map((e) => e.name)).toEqual(['Alpha', 'Charlie']);
  });

  it('paginates while preserving the total', async () => {
    const page1 = await client(fakeWithSeed()).entityUsage.list({ limit: 2, offset: 0 });
    expect(page1.data.map((e) => e.name)).toEqual(['Alpha', 'Bravo']);
    expect(page1.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });

    const page2 = await client(fakeWithSeed()).entityUsage.list({ limit: 2, offset: 2 });
    expect(page2.data.map((e) => e.name)).toEqual(['Charlie']);
    expect(page2.pagination).toMatchObject({ total: 3, hasMore: false });
  });

  it('projects aliases and defaultTags as arrays from the contact wire shape', async () => {
    const { data } = await client(fakeWithSeed()).entityUsage.list({ search: 'Alpha' });
    const alpha = data[0];
    expect(alpha?.aliases).toEqual(['Alpha Co', 'ALP']);
    expect(alpha?.defaultTags).toEqual(['groceries']);
  });

  it('degrades to an empty list when contacts is unavailable', async () => {
    const down = makeContactsFake({ unavailable: true });
    const { data, pagination } = await client(down).entityUsage.list();
    expect(data).toEqual([]);
    expect(pagination.total).toBe(0);
  });
});
