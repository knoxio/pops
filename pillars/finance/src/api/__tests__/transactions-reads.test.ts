/**
 * Integration tests for the transactions read-helpers: `suggestTags`
 * (rule-based, via the tag-suggester), `descriptionsForPreview` (paged
 * descriptions + truncation flag), and `availableTags` (distinct sorted tag
 * values).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake, type ContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-txreads-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(contacts: ContactsFake = makeContactsFake()) {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts,
    })
  );
}

const tx = (over: Record<string, unknown>) => ({
  description: 'WOOLWORTHS METRO',
  account: 'Everyday',
  amount: -10,
  date: '2026-01-01',
  type: 'expense',
  ...over,
});

describe('transactions.suggestTags', () => {
  it('suggests tags from an active tag rule matching the description', async () => {
    await client().tagRules.apply({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: ['groceries'] },
          },
        ],
      },
      acceptedNewTags: [],
    });

    const matched = await client().transactions.suggestTags({ description: 'WOOLWORTHS METRO' });
    expect(matched.tags).toContain('groceries');

    const unmatched = await client().transactions.suggestTags({ description: 'ELECTRICITY BILL' });
    expect(unmatched.tags).toEqual([]);
  });

  it('pulls entity-default tags from the live contacts fetch for the given entityId', async () => {
    const contacts = makeContactsFake({
      seed: [{ id: 'ent-acme', name: 'Acme', defaultTags: ['supplier', 'recurring'] }],
    });
    const { tags } = await client(contacts).transactions.suggestTags({
      description: 'ACME PURCHASE',
      entityId: 'ent-acme',
    });
    expect(tags).toEqual(expect.arrayContaining(['supplier', 'recurring']));
  });

  it('contributes no entity tags when contacts is unavailable', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const { tags } = await client(contacts).transactions.suggestTags({
      description: 'ACME PURCHASE',
      entityId: 'ent-acme',
    });
    expect(tags).toEqual([]);
  });
});

describe('transactions.availableTags', () => {
  it('returns distinct, sorted tags across transactions and ignores empty arrays', async () => {
    await client().transactions.create(tx({ description: 'A', tags: ['food', 'coffee'] }));
    await client().transactions.create(tx({ description: 'B', tags: ['coffee', 'work'] }));
    await client().transactions.create(tx({ description: 'C', tags: [] }));

    const { tags } = await client().transactions.availableTags();
    expect(tags).toEqual(['coffee', 'food', 'work']);
  });

  it('returns an empty array when no transactions exist', async () => {
    expect((await client().transactions.availableTags()).tags).toEqual([]);
  });
});

describe('transactions.descriptionsForPreview', () => {
  it('returns descriptions with a truncation flag honouring the limit', async () => {
    for (const d of ['one', 'two', 'three']) {
      await client().transactions.create(tx({ description: d }));
    }

    const limited = await client().transactions.descriptionsForPreview({ limit: 2 });
    expect(limited.data).toHaveLength(2);
    expect(limited.total).toBe(3);
    expect(limited.truncated).toBe(true);

    const all = await client().transactions.descriptionsForPreview();
    expect(all.data).toHaveLength(3);
    expect(all.truncated).toBe(false);
    expect(all.data[0]).toHaveProperty('checksum');
  });
});
