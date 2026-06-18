/**
 * Tests for the `core.entities.*` tRPC router in the core pillar container.
 *
 * Relocated from `apps/pops-api/src/modules/core/entities/entities.test.ts`.
 * The finance-join coverage (`transactionCount`, `orphanedOnly`, the FK
 * NULL-cascade) is intentionally dropped: the pillar's entities surface is
 * the plain `entities`-table CRUD, with no transaction enrichment.
 *
 * Each test runs against an in-memory core.db opened per-test via
 * `openCoreDb`, mirroring the settings router suite.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../../../db/index.js';
import { appRouter } from '../../../router.js';
import { type Context } from '../../../trpc.js';

import type { Entity } from '../types.js';

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

interface SeedEntityFields {
  id?: string;
  name: string;
  type?: string;
  abn?: string | null;
  aliases?: string | null;
  default_transaction_type?: string | null;
  default_tags?: string | null;
  last_edited_time?: string;
}

function seedEntity(fields: SeedEntityFields): string {
  const id = fields.id ?? crypto.randomUUID();
  coreDb.raw
    .prepare(
      `INSERT INTO entities
         (id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      fields.name,
      fields.type ?? 'company',
      fields.abn ?? null,
      fields.aliases ?? null,
      fields.default_transaction_type ?? null,
      fields.default_tags ?? null,
      null,
      fields.last_edited_time ?? new Date().toISOString()
    );
  return id;
}

function userCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email: 'admin@example.com' },
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = { user: null, serviceAccount: null, coreDb: coreDb.db };
  return appRouter.createCaller(ctx);
}

describe('core.entities.list', () => {
  it('returns empty list when no entities exist', async () => {
    const result = await userCaller().core.entities.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it('returns all entities sorted by name', async () => {
    seedEntity({ name: 'Woolworths', type: 'company' });
    seedEntity({ name: 'Coles', type: 'company' });

    const result = await userCaller().core.entities.list({});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(result.data[0]!.name).toBe('Coles');
    expect(result.data[1]!.name).toBe('Woolworths');
  });

  it('returns camelCase fields with no snake_case leakage', async () => {
    seedEntity({
      name: 'Woolworths',
      type: 'company',
      default_transaction_type: 'Purchase',
      default_tags: '["Groceries"]',
      last_edited_time: '2025-06-15T10:00:00.000Z',
    });

    const result = await userCaller().core.entities.list({});
    const entity = result.data[0];
    expect(entity).toHaveProperty('id');
    expect(entity).toHaveProperty('defaultTransactionType', 'Purchase');
    expect(entity).toHaveProperty('defaultTags', ['Groceries']);
    expect(entity).toHaveProperty('lastEditedTime', '2025-06-15T10:00:00.000Z');
    expect(entity).not.toHaveProperty('notion_id');
    expect(entity).not.toHaveProperty('last_edited_time');
    expect(entity).not.toHaveProperty('transactionCount');
  });

  it('splits comma-separated aliases into an array', async () => {
    seedEntity({ name: 'Woolworths', aliases: 'Woolies, WW, Woolworths Group' });

    const result = await userCaller().core.entities.list({});
    expect(result.data[0]!.aliases).toEqual(['Woolies', 'WW', 'Woolworths Group']);
  });

  it('returns empty aliases array when null', async () => {
    seedEntity({ name: 'Woolworths', aliases: null });

    const result = await userCaller().core.entities.list({});
    expect(result.data[0]!.aliases).toEqual([]);
  });

  it('filters by search (case-insensitive LIKE)', async () => {
    seedEntity({ name: 'Woolworths' });
    seedEntity({ name: 'Coles' });
    seedEntity({ name: 'Aldi' });

    const result = await userCaller().core.entities.list({ search: 'wool' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe('Woolworths');
    expect(result.pagination.total).toBe(1);
  });

  it('filters by type', async () => {
    seedEntity({ name: 'Woolworths', type: 'company' });
    seedEntity({ name: 'ATO', type: 'organisation' });

    const result = await userCaller().core.entities.list({ type: 'organisation' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe('ATO');
  });

  it('paginates with limit and offset', async () => {
    for (let i = 0; i < 10; i++) {
      seedEntity({ name: `Entity ${String(i).padStart(2, '0')}` });
    }

    const page1 = await userCaller().core.entities.list({ limit: 3, offset: 0 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pagination).toEqual({ total: 10, limit: 3, offset: 0, hasMore: true });

    const page2 = await userCaller().core.entities.list({ limit: 3, offset: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.pagination.offset).toBe(3);

    const page1Names = page1.data.map((e: Entity) => e.name);
    const page2Names = page2.data.map((e: Entity) => e.name);
    expect(page1Names).not.toEqual(page2Names);
  });

  it('defaults limit to 50 and offset to 0', async () => {
    const result = await userCaller().core.entities.list({});
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.offset).toBe(0);
  });

  it('sorts case-insensitively (BYD after Buffet and Bunnings)', async () => {
    seedEntity({ name: 'BYD' });
    seedEntity({ name: 'Buffet 88' });
    seedEntity({ name: 'Bunnings Warehouse' });

    const result = await userCaller().core.entities.list({});
    const names = result.data.map((e: Entity) => e.name);
    expect(names).toEqual(['Buffet 88', 'Bunnings Warehouse', 'BYD']);
  });

  it('throws UNAUTHORIZED without auth', async () => {
    await expect(anonCaller().core.entities.list({})).rejects.toThrow(TRPCError);
    await expect(anonCaller().core.entities.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('core.entities.get', () => {
  it('returns a single entity by ID', async () => {
    const id = seedEntity({ name: 'Woolworths' });

    const result = await userCaller().core.entities.get({ id });
    expect(result.data.id).toBe(id);
    expect(result.data.name).toBe('Woolworths');
  });

  it('throws NOT_FOUND for a non-existent ID', async () => {
    await expect(userCaller().core.entities.get({ id: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('core.entities.create', () => {
  it('creates an entity with required fields only', async () => {
    const result = await userCaller().core.entities.create({ name: 'Woolworths' });
    expect(result.message).toBe('Entity created');
    expect(result.data.name).toBe('Woolworths');
    expect(result.data.id).toBeDefined();
    expect(result.data.aliases).toEqual([]);
    expect(result.data.type).toBe('company');
  });

  it('creates an entity with all fields', async () => {
    const result = await userCaller().core.entities.create({
      name: 'Woolworths',
      type: 'company',
      abn: '88000014675',
      aliases: ['Woolies', 'WW'],
      defaultTransactionType: 'Purchase',
      defaultTags: ['Groceries'],
      notes: 'Supermarket chain',
    });

    expect(result.data.name).toBe('Woolworths');
    expect(result.data.type).toBe('company');
    expect(result.data.abn).toBe('88000014675');
    expect(result.data.aliases).toEqual(['Woolies', 'WW']);
    expect(result.data.defaultTransactionType).toBe('Purchase');
    expect(result.data.defaultTags).toEqual(['Groceries']);
    expect(result.data.notes).toBe('Supermarket chain');
  });

  it('throws CONFLICT for a duplicate entity name', async () => {
    seedEntity({ name: 'Woolworths' });
    await expect(userCaller().core.entities.create({ name: 'Woolworths' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws BAD_REQUEST for an empty name', async () => {
    await expect(userCaller().core.entities.create({ name: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('persists to the database', async () => {
    await userCaller().core.entities.create({ name: 'New Entity' });
    const row = coreDb.raw.prepare('SELECT * FROM entities WHERE name = ?').get('New Entity');
    expect(row).toBeDefined();
  });
});

describe('core.entities.update', () => {
  it('updates a single field', async () => {
    const id = seedEntity({ name: 'Woolworths' });
    const result = await userCaller().core.entities.update({ id, data: { type: 'brand' } });
    expect(result.message).toBe('Entity updated');
    expect(result.data.name).toBe('Woolworths');
    expect(result.data.type).toBe('brand');
  });

  it('updates multiple fields at once', async () => {
    const id = seedEntity({ name: 'Woolworths' });
    const result = await userCaller().core.entities.update({
      id,
      data: { name: 'Woolworths Group', type: 'company', aliases: ['Woolies', 'WW'] },
    });
    expect(result.data.name).toBe('Woolworths Group');
    expect(result.data.type).toBe('company');
    expect(result.data.aliases).toEqual(['Woolies', 'WW']);
  });

  it('clears a nullable field by setting it to null', async () => {
    const id = seedEntity({ name: 'Woolworths', abn: '88000014675' });
    const result = await userCaller().core.entities.update({ id, data: { abn: null } });
    expect(result.data.abn).toBeNull();
  });

  it('refreshes last_edited_time on update', async () => {
    const id = seedEntity({ name: 'Woolworths', last_edited_time: '2020-01-01T00:00:00.000Z' });
    await userCaller().core.entities.update({ id, data: { type: 'brand' } });

    const row = coreDb.raw
      .prepare('SELECT last_edited_time FROM entities WHERE id = ?')
      .get(id) as { last_edited_time: string };
    expect(row.last_edited_time).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('throws NOT_FOUND for a non-existent ID', async () => {
    await expect(
      userCaller().core.entities.update({ id: 'does-not-exist', data: { name: 'New Name' } })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BAD_REQUEST for an empty name', async () => {
    const id = seedEntity({ name: 'Woolworths' });
    await expect(
      userCaller().core.entities.update({ id, data: { name: '' } })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws CONFLICT when renaming to an existing name', async () => {
    seedEntity({ name: 'Woolworths' });
    const colesId = seedEntity({ name: 'Coles' });
    await expect(
      userCaller().core.entities.update({ id: colesId, data: { name: 'Woolworths' } })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows renaming to the same name (no false conflict)', async () => {
    const id = seedEntity({ name: 'Woolworths' });
    const result = await userCaller().core.entities.update({ id, data: { name: 'Woolworths' } });
    expect(result.data.name).toBe('Woolworths');
  });
});

describe('core.entities.delete', () => {
  it('deletes an existing entity', async () => {
    const id = seedEntity({ name: 'Woolworths' });
    const result = await userCaller().core.entities.delete({ id });
    expect(result.message).toBe('Entity deleted');

    const row = coreDb.raw.prepare('SELECT * FROM entities WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('throws NOT_FOUND for a non-existent ID', async () => {
    await expect(userCaller().core.entities.delete({ id: 'does-not-exist' })).rejects.toMatchObject(
      { code: 'NOT_FOUND' }
    );
  });

  it('is idempotent — second delete throws NOT_FOUND', async () => {
    const id = seedEntity({ name: 'Woolworths' });
    await userCaller().core.entities.delete({ id });
    await expect(userCaller().core.entities.delete({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
