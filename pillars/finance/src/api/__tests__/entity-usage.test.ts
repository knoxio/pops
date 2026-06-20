/**
 * Integration tests for the `entityUsage.*` REST surface — entities LEFT JOINed
 * to finance `transactions` for a per-entity `transactionCount`, with the
 * orphaned / search / type filters, pagination, and the aliases/defaultTags
 * projection. Mirrors the monolith `core.entities.list` semantics.
 *
 * Entities + transactions are seeded directly through the finance-db handle so
 * the join runs against real rows.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  entities,
  openFinanceDb,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
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

function client() {
  return makeClient(
    createFinanceApiApp({ financeDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3004' })
  );
}

function seedEntity(opts: {
  id: string;
  name: string;
  type?: string;
  aliases?: string | null;
  defaultTags?: string | null;
}): void {
  financeDb.db
    .insert(entities)
    .values({
      id: opts.id,
      name: opts.name,
      type: opts.type ?? 'company',
      aliases: opts.aliases ?? null,
      defaultTags: opts.defaultTags ?? null,
      lastEditedTime: '2026-01-01T00:00:00.000Z',
    })
    .run();
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

beforeEach(() => {
  seedEntity({
    id: 'ent-alpha',
    name: 'Alpha',
    type: 'company',
    aliases: 'Alpha Co, ALP',
    defaultTags: JSON.stringify(['groceries']),
  });
  seedEntity({ id: 'ent-bravo', name: 'Bravo', type: 'person' });
  seedEntity({ id: 'ent-charlie', name: 'Charlie', type: 'company' });
  seedTxn('ent-alpha', 'ALPHA STORE 1', '2026-01-01');
  seedTxn('ent-alpha', 'ALPHA STORE 2', '2026-01-02');
  seedTxn('ent-charlie', 'CHARLIE CAFE', '2026-01-03');
});

describe('entityUsage — transactionCount rollup', () => {
  it('lists every entity with its transactionCount, ordered by name', async () => {
    const { data, pagination } = await client().entityUsage.list();
    expect(data.map((e) => e.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    const counts = new Map(data.map((e) => [e.name, e.transactionCount]));
    expect(counts.get('Alpha')).toBe(2);
    expect(counts.get('Bravo')).toBe(0);
    expect(counts.get('Charlie')).toBe(1);
    expect(pagination.total).toBe(3);
  });

  it('orphanedOnly=true returns only entities with zero transactions', async () => {
    const { data, pagination } = await client().entityUsage.list({ orphanedOnly: 'true' });
    expect(data.map((e) => e.name)).toEqual(['Bravo']);
    expect(data[0]?.transactionCount).toBe(0);
    expect(pagination.total).toBe(1);
  });

  it('orphanedOnly=false returns all entities (count===0 not filtered)', async () => {
    const { data } = await client().entityUsage.list({ orphanedOnly: 'false' });
    expect(data).toHaveLength(3);
  });

  it('filters by search (name LIKE)', async () => {
    const { data } = await client().entityUsage.list({ search: 'lph' });
    expect(data.map((e) => e.name)).toEqual(['Alpha']);
    expect(data[0]?.transactionCount).toBe(2);
  });

  it('filters by type', async () => {
    const { data } = await client().entityUsage.list({ type: 'company' });
    expect(data.map((e) => e.name)).toEqual(['Alpha', 'Charlie']);
  });

  it('paginates while preserving the total', async () => {
    const page1 = await client().entityUsage.list({ limit: 2, offset: 0 });
    expect(page1.data.map((e) => e.name)).toEqual(['Alpha', 'Bravo']);
    expect(page1.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });

    const page2 = await client().entityUsage.list({ limit: 2, offset: 2 });
    expect(page2.data.map((e) => e.name)).toEqual(['Charlie']);
    expect(page2.pagination).toMatchObject({ total: 3, hasMore: false });
  });

  it('projects aliases (comma-split) and defaultTags (JSON) to arrays', async () => {
    const { data } = await client().entityUsage.list({ search: 'Alpha' });
    const alpha = data[0];
    expect(alpha?.aliases).toEqual(['Alpha Co', 'ALP']);
    expect(alpha?.defaultTags).toEqual(['groceries']);
  });
});
