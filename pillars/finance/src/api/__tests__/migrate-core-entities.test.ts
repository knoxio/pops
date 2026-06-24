/**
 * Unit tests for the core→contacts entity migrator: the pure row→contact
 * mapping and the idempotent orchestration (create-or-fetch-by-name, re-run
 * safety, summary).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  coreEntityToContactCreate,
  migrateCoreEntities,
  type ContactCreateBody,
  type CoreEntity,
  type MigrateOutcome,
} from '../contacts/migrate-core-entities.js';

function coreEntity(over: Partial<CoreEntity> & { name: string }): CoreEntity {
  return {
    id: over.id ?? crypto.randomUUID(),
    name: over.name,
    type: over.type ?? 'company',
    abn: over.abn ?? null,
    aliases: over.aliases ?? [],
    defaultTransactionType: over.defaultTransactionType ?? null,
    defaultTags: over.defaultTags ?? [],
    notes: over.notes ?? null,
    lastEditedTime: over.lastEditedTime ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('coreEntityToContactCreate', () => {
  it('carries every wire field, dropping id and lastEditedTime', () => {
    const entity = coreEntity({
      id: 'core-id',
      name: 'Acme',
      type: 'government',
      abn: '123',
      aliases: ['ACME Corp', 'Acme Inc'],
      defaultTransactionType: 'purchase',
      defaultTags: ['supplier'],
      notes: 'preferred',
      lastEditedTime: '2026-05-05T00:00:00.000Z',
    });

    const body = coreEntityToContactCreate(entity);

    expect(body).toEqual({
      name: 'Acme',
      type: 'government',
      abn: '123',
      aliases: ['ACME Corp', 'Acme Inc'],
      defaultTransactionType: 'purchase',
      defaultTags: ['supplier'],
      notes: 'preferred',
    });
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('lastEditedTime');
  });

  it('preserves nulls and empty arrays verbatim', () => {
    const body = coreEntityToContactCreate(coreEntity({ name: 'Bare' }));
    expect(body).toEqual({
      name: 'Bare',
      type: 'company',
      abn: null,
      aliases: [],
      defaultTransactionType: null,
      defaultTags: [],
      notes: null,
    });
  });
});

describe('migrateCoreEntities', () => {
  it('creates every core entity in contacts and reports the summary', async () => {
    const entities = [coreEntity({ name: 'Alpha' }), coreEntity({ name: 'Bravo' })];
    const created: ContactCreateBody[] = [];
    const createContact = vi.fn(async (body: ContactCreateBody): Promise<MigrateOutcome> => {
      created.push(body);
      return 'created';
    });

    const summary = await migrateCoreEntities({
      readCoreEntities: async () => entities,
      createContact,
    });

    expect(summary).toEqual({ total: 2, created: 2, alreadyExisted: 0 });
    expect(created.map((b) => b.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('is idempotent — a re-run where every name already exists creates nothing', async () => {
    const entities = [coreEntity({ name: 'Alpha' }), coreEntity({ name: 'Bravo' })];
    const createContact = vi.fn(async (): Promise<MigrateOutcome> => 'already-exists');

    const summary = await migrateCoreEntities({
      readCoreEntities: async () => entities,
      createContact,
    });

    expect(summary).toEqual({ total: 2, created: 0, alreadyExisted: 2 });
  });

  it('counts a mixed run (some new, some pre-existing)', async () => {
    const entities = [
      coreEntity({ name: 'New' }),
      coreEntity({ name: 'Old' }),
      coreEntity({ name: 'AlsoNew' }),
    ];
    const createContact = vi.fn(
      async (body: ContactCreateBody): Promise<MigrateOutcome> =>
        body.name === 'Old' ? 'already-exists' : 'created'
    );

    const summary = await migrateCoreEntities({
      readCoreEntities: async () => entities,
      createContact,
    });

    expect(summary).toEqual({ total: 3, created: 2, alreadyExisted: 1 });
  });

  it('propagates a hard create failure (does not silently drop a row)', async () => {
    const createContact = vi.fn(async (): Promise<MigrateOutcome> => {
      throw new Error('contacts unavailable');
    });

    await expect(
      migrateCoreEntities({
        readCoreEntities: async () => [coreEntity({ name: 'Alpha' })],
        createContact,
      })
    ).rejects.toThrow('contacts unavailable');
  });

  it('handles an empty core set', async () => {
    const summary = await migrateCoreEntities({
      readCoreEntities: async () => [],
      createContact: vi.fn(),
    });
    expect(summary).toEqual({ total: 0, created: 0, alreadyExisted: 0 });
  });
});
