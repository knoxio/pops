/**
 * Integration tests for `accounts/:id/imports`, `accounts/:id/import-config`
 * and the `importStatus` every accounts response carries (POPS-2917,
 * finance ADR-003).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { insertBatch } from '../../db/services/import-batches.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-account-imports-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

async function anAccount(name = 'Everyday') {
  const created = await client().accounts.create({ name, kind: 'checking', currency: 'AUD' });
  return created.data.id;
}

function batchAt(accountId: string, createdAt: string, sourceRef: string | null = null) {
  const row = insertBatch(
    financeDb.db,
    { accountId, sourceKind: 'csv-dialect', sourceRef, rowCount: 3 },
    []
  );
  financeDb.raw
    .prepare('UPDATE import_batches SET created_at = ? WHERE id = ?')
    .run(createdAt, row.id);
  return row.id;
}

const NULL_STATUS = {
  lastImportAt: null,
  lastSyncedAt: null,
  lastBatchId: null,
  newestTransactionDate: null,
  span: null,
  cadenceDays: null,
  source: null,
};

describe('importStatus on the accounts wire', () => {
  it('is present with every field null on an account never imported into, on list and get', async () => {
    const id = await anAccount();

    const listed = await client().accounts.list();
    const fetched = await client().accounts.get(id);

    expect(listed.data[0]?.importStatus).toEqual(NULL_STATUS);
    expect(fetched.data.importStatus).toEqual(NULL_STATUS);
  });

  it('reports the newest batch, its source and the cadence once there are three', async () => {
    const id = await anAccount();
    batchAt(id, '2026-08-01T00:00:00.000Z', 'ING');
    batchAt(id, '2026-08-15T00:00:00.000Z', 'ING');
    const newest = batchAt(id, '2026-08-29T00:00:00.000Z', 'ING');

    const fetched = await client().accounts.get(id);

    expect(fetched.data.importStatus).toMatchObject({
      lastImportAt: '2026-08-29T00:00:00.000Z',
      lastBatchId: newest,
      cadenceDays: 14,
      source: { kind: 'csv-dialect', dialectId: 'ING' },
    });
  });
});

describe('GET /accounts/:id/imports', () => {
  it('404s an unknown account', async () => {
    await expect(client().accountImports.listBatches('nope')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('lists newest first and pages on createdAt', async () => {
    const id = await anAccount();
    const oldest = batchAt(id, '2026-08-01T00:00:00.000Z');
    const middle = batchAt(id, '2026-08-15T00:00:00.000Z');
    const newest = batchAt(id, '2026-08-29T00:00:00.000Z');

    const first = await client().accountImports.listBatches(id, { limit: 2 });
    expect(first.data.map((b) => b.id)).toEqual([newest, middle]);
    expect(first.nextBefore).toBe('2026-08-15T00:00:00.000Z');
    expect(first.data[0]).toMatchObject({
      accountId: id,
      sourceKind: 'csv-dialect',
      rowCount: 3,
      dateFrom: null,
      dateTo: null,
      checkpointId: null,
    });

    const second = await client().accountImports.listBatches(id, {
      limit: 2,
      before: first.nextBefore ?? undefined,
    });
    expect(second.data.map((b) => b.id)).toEqual([oldest]);
    expect(second.nextBefore).toBeNull();
  });
});

describe('import-config routes', () => {
  it('404s the config of an account that has none, and of an unknown account', async () => {
    const id = await anAccount();
    await expect(client().accountImports.getConfig(id)).rejects.toMatchObject({ status: 404 });
    await expect(client().accountImports.getConfig('nope')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('writes, reads back and replaces a config whole', async () => {
    const id = await anAccount();

    const written = await client().accountImports.writeConfig(id, {
      sourceKind: 'csv-dialect',
      dialectId: 'ING',
      expectedCadenceDays: 30,
    });
    expect(written.data).toMatchObject({
      accountId: id,
      sourceKind: 'csv-dialect',
      dialectId: 'ING',
      parserId: null,
      provider: null,
      externalAccountRef: null,
      expectedCadenceDays: 30,
      secretRef: null,
    });

    const replaced = await client().accountImports.writeConfig(id, {
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-1',
      secretRef: 'UP_TOKEN',
    });
    expect(replaced.data).toMatchObject({
      sourceKind: 'api',
      dialectId: null,
      provider: 'up',
      externalAccountRef: 'up-acc-1',
      expectedCadenceDays: null,
      secretRef: 'UP_TOKEN',
    });

    const read = await client().accountImports.getConfig(id);
    expect(read.data).toEqual(replaced.data);
    expect((await client().accounts.get(id)).data.importStatus.source).toEqual({
      kind: 'api',
      provider: 'up',
    });
  });

  it('422s a config missing what its kind needs, and 400s an unknown provider', async () => {
    const id = await anAccount();

    await expect(
      client().accountImports.writeConfig(id, { sourceKind: 'api' })
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      client().accountImports.writeConfig(id, { sourceKind: 'csv-dialect', dialectId: null })
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      client().accountImports.writeConfig(id, { sourceKind: 'api', provider: 'nab' })
    ).rejects.toMatchObject({ status: 400 });
    await expect(client().accountImports.getConfig(id)).rejects.toMatchObject({ status: 404 });
  });

  it('404s writing a config for an unknown account', async () => {
    await expect(
      client().accountImports.writeConfig('nope', { sourceKind: 'csv-dialect', dialectId: 'ING' })
    ).rejects.toMatchObject({ status: 404 });
  });
});
