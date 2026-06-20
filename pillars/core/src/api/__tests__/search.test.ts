/**
 * Integration tests for the `search.*` REST surface (core's slice of unified
 * search), driven through the real Express app via supertest.
 *
 * Ported from the monolith's `entitiesSearchAdapter`
 * (`apps/pops-api/src/modules/core/entities/search-adapter.ts`). The suite
 * proves the ranking is preserved: exact (1.0) > prefix (0.8) > contains (0.5),
 * sorted descending, with the `pops:finance/entity/<id>` uri shape; and that
 * an empty / whitespace query short-circuits to an empty hit list.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-search-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' })
  );
}

describe('search — entities slice', () => {
  it('returns a hit for a seeded entity, scored by match type', async () => {
    const created = await client().entities.create({
      name: 'Acme',
      type: 'company',
      aliases: ['ACME', 'Acme Inc'],
    });

    const { hits } = await client().search.run({ query: { text: 'acme' } });
    expect(hits).toHaveLength(1);
    const [hit] = hits;
    expect(hit.uri).toBe(`pops:finance/entity/${created.data.id}`);
    expect(hit.score).toBe(1.0);
    expect(hit.matchField).toBe('name');
    expect(hit.matchType).toBe('exact');
    expect(hit.data).toMatchObject({
      name: 'Acme',
      type: 'company',
      aliases: ['ACME', 'Acme Inc'],
    });
  });

  it('ranks exact > prefix > contains and sorts descending by score', async () => {
    await client().entities.create({ name: 'Bank' });
    await client().entities.create({ name: 'Bankwest' });
    await client().entities.create({ name: 'My Bank Account' });

    const { hits } = await client().search.run({ query: { text: 'bank' } });
    expect(hits.map((h) => h.data['name'])).toEqual(['Bank', 'Bankwest', 'My Bank Account']);
    expect(hits.map((h) => h.score)).toEqual([1.0, 0.8, 0.5]);
    expect(hits.map((h) => h.matchType)).toEqual(['exact', 'prefix', 'contains']);
  });

  it('excludes rows that do not contain the query text', async () => {
    await client().entities.create({ name: 'Telstra' });
    const { hits } = await client().search.run({ query: { text: 'acme' } });
    expect(hits).toHaveLength(0);
  });

  it('returns an empty list for an empty or whitespace query', async () => {
    await client().entities.create({ name: 'Acme' });
    expect((await client().search.run({ query: { text: '' } })).hits).toEqual([]);
    expect((await client().search.run({ query: { text: '   ' } })).hits).toEqual([]);
  });

  it('accepts an optional search context without affecting results', async () => {
    await client().entities.create({ name: 'Acme' });
    const { hits } = await client().search.run({
      query: { text: 'acme' },
      context: { app: 'finance', page: 'transactions' },
    });
    expect(hits).toHaveLength(1);
  });
});
