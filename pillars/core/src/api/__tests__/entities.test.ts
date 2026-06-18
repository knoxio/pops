/**
 * Integration tests for the `entities.*` REST surface, driven through the
 * real Express app via supertest. This is the exemplar for the core REST
 * (ts-rest) migration — it runs against the SAME app that still serves the
 * legacy `/trpc` router, proving the dual-serve wiring.
 *
 * The suite focuses on the wire contract: envelope shapes (bare entity rows,
 * `{ data, pagination }` for list, NO transactionCount), the `toEntity`
 * field derivations (aliases/defaultTags parsing), error-status mapping
 * (404 / 409), zod boundary validation (400), and pagination metadata.
 * Service-layer invariants live in the db package tests.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-entities-test-'));
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

describe('entities — happy paths', () => {
  it('creates an entity with derived array fields and reads it back as a bare row', async () => {
    const created = await client().entities.create({
      name: 'Acme Pty Ltd',
      type: 'company',
      abn: '12345678901',
      aliases: ['Acme', 'ACME'],
      defaultTransactionType: 'expense',
      defaultTags: ['supplier', 'au'],
      notes: 'primary vendor',
    });

    expect(created.data.id).toBeTruthy();
    expect(created.message).toBe('Entity created');
    expect(created.data).toMatchObject({
      name: 'Acme Pty Ltd',
      type: 'company',
      abn: '12345678901',
      aliases: ['Acme', 'ACME'],
      defaultTransactionType: 'expense',
      defaultTags: ['supplier', 'au'],
      notes: 'primary vendor',
    });
    expect(created.data.lastEditedTime).toBeTruthy();
    // The finance-owned transactionCount enrichment must NOT be present.
    expect(created.data).not.toHaveProperty('transactionCount');

    const fetched = await client().entities.get(created.data.id);
    expect(fetched.data).toMatchObject({
      id: created.data.id,
      name: 'Acme Pty Ltd',
      aliases: ['Acme', 'ACME'],
      defaultTags: ['supplier', 'au'],
    });
  });

  it('defaults type to "company" and leaves array fields empty when omitted', async () => {
    const created = await client().entities.create({ name: 'Solo Person' });
    expect(created.data.type).toBe('company');
    expect(created.data.aliases).toEqual([]);
    expect(created.data.defaultTags).toEqual([]);
    expect(created.data.abn).toBeNull();
    expect(created.data.defaultTransactionType).toBeNull();
    expect(created.data.notes).toBeNull();
  });

  it('lists, updates, then deletes an entity', async () => {
    const created = await client().entities.create({ name: 'Updatable', type: 'organisation' });

    const listed = await client().entities.list();
    expect(listed.data.map((e) => e.name)).toContain('Updatable');
    expect(listed.pagination.total).toBe(1);

    const updated = await client().entities.update(created.data.id, {
      notes: 'now annotated',
      defaultTags: ['x', 'y'],
    });
    expect(updated.message).toBe('Entity updated');
    expect(updated.data.notes).toBe('now annotated');
    expect(updated.data.defaultTags).toEqual(['x', 'y']);

    const deleted = await client().entities.delete(created.data.id);
    expect(deleted.message).toBe('Entity deleted');

    const after = await client().entities.list();
    expect(after.data).toHaveLength(0);
  });
});

describe('entities — filters & pagination', () => {
  it('filters by search (name, case-insensitive) and by type', async () => {
    await client().entities.create({ name: 'Alpha Bank', type: 'bank' });
    await client().entities.create({ name: 'Beta Corp', type: 'company' });
    await client().entities.create({ name: 'Gamma Bank', type: 'bank' });

    const banks = await client().entities.list({ type: 'bank' });
    expect(banks.data.map((e) => e.name).toSorted()).toEqual(['Alpha Bank', 'Gamma Bank']);

    const searched = await client().entities.list({ search: 'beta' });
    expect(searched.data.map((e) => e.name)).toEqual(['Beta Corp']);
  });

  it('honours limit/offset and reports hasMore', async () => {
    for (const name of ['a', 'b', 'c']) {
      await client().entities.create({ name });
    }
    const page = await client().entities.list({ limit: 2, offset: 0 });
    expect(page.data).toHaveLength(2);
    expect(page.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });

    const last = await client().entities.list({ limit: 2, offset: 2 });
    expect(last.data).toHaveLength(1);
    expect(last.pagination.hasMore).toBe(false);
  });

  it('sorts entities case-insensitively by name', async () => {
    for (const name of ['zebra', 'Apple', 'mango']) {
      await client().entities.create({ name });
    }
    const all = await client().entities.list();
    expect(all.data.map((e) => e.name)).toEqual(['Apple', 'mango', 'zebra']);
  });
});

describe('entities — error mapping', () => {
  it('404s an unknown get / update / delete', async () => {
    await expect(client().entities.get('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().entities.update('nope', { name: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().entities.delete('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('409s a duplicate name on create and on update', async () => {
    await client().entities.create({ name: 'Unique Co' });
    await expect(client().entities.create({ name: 'Unique Co' })).rejects.toMatchObject({
      status: 409,
    });

    const other = await client().entities.create({ name: 'Other Co' });
    await expect(
      client().entities.update(other.data.id, { name: 'Unique Co' })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('400s an empty name at the contract boundary', async () => {
    await expect(client().entities.create({ name: '' })).rejects.toMatchObject({ status: 400 });
  });

  it('400s an unknown entity type at the contract boundary', async () => {
    await expect(
      client().entities.create({ name: 'Bad type', type: 'martian' })
    ).rejects.toMatchObject({ status: 400 });
  });
});
