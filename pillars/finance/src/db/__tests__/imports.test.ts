/**
 * Invariant tests for the imports persistence helpers against an
 * in-memory SQLite seeded with the canonical `transactions` + `entities`
 * DDL. Pure DB + service layer — no transformers, no AI categoriser, no
 * tRPC, no Express.
 *
 * Higher-level orchestration coverage (transformer pipeline, AI matching,
 * progress streaming, commit phase) stays in pops-api until later PRs of
 * the N6 sequence — Phase 1 PR 1 is scaffold-only.
 *
 * The DDL is inlined rather than read from the shared baseline migration
 * (`0000_naive_chameleon.sql`) because that migration creates the entire
 * pre-modular schema (hundreds of tables) and applying it for every test
 * here is wasted work. The byte-identical DDL is reproduced from
 * `packages/db-types/src/schema/{transactions,entities}.ts`.
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { ImportTransactionPersistError } from '../errors.js';
import { entities, transactions } from '../schema.js';
import {
  createImportEntity,
  findExistingChecksums,
  insertImportTransaction,
  loadEntityMaps,
} from '../services/imports.js';

import type { FinanceDb } from '../services/internal.js';

const SCHEMA_DDL = `
CREATE TABLE entities (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  name text NOT NULL,
  type text DEFAULT 'company' NOT NULL,
  abn text,
  aliases text,
  default_transaction_type text,
  default_tags text,
  notes text,
  last_edited_time text NOT NULL,
  owner_uri text,
  owner_uri_stale_at text
);
CREATE UNIQUE INDEX entities_notion_id_unique ON entities (notion_id);
CREATE INDEX idx_entities_owner_uri ON entities (owner_uri);

CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  amount real NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text DEFAULT '[]' NOT NULL,
  entity_id text,
  entity_name text,
  location text,
  country text,
  related_transaction_id text,
  notes text,
  checksum text,
  raw_row text,
  last_edited_time text NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX transactions_notion_id_unique ON transactions (notion_id);
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_account ON transactions (account);
CREATE INDEX idx_transactions_entity ON transactions (entity_id);
CREATE INDEX idx_transactions_last_edited ON transactions (last_edited_time);
CREATE INDEX idx_transactions_notion_id ON transactions (notion_id);
CREATE UNIQUE INDEX idx_transactions_checksum ON transactions (checksum);
`;

interface TestHarness {
  db: FinanceDb;
  raw: Database.Database;
}

function freshDb(): TestHarness {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(SCHEMA_DDL);
  return { db: drizzle(raw), raw };
}

function seedEntity(
  db: FinanceDb,
  input: { id?: string; name: string; aliases?: string | null }
): string {
  const id = input.id ?? crypto.randomUUID();
  db.insert(entities)
    .values({
      id,
      name: input.name,
      aliases: input.aliases ?? null,
      lastEditedTime: new Date().toISOString(),
    })
    .run();
  return id;
}

function seedTransaction(
  db: FinanceDb,
  input: { description?: string; checksum?: string | null; date?: string; account?: string }
): string {
  const id = crypto.randomUUID();
  db.insert(transactions)
    .values({
      id,
      description: input.description ?? 'seed txn',
      account: input.account ?? 'amex',
      amount: -10,
      date: input.date ?? '2026-01-01',
      type: 'Expense',
      tags: '[]',
      entityId: null,
      entityName: null,
      location: null,
      checksum: input.checksum ?? null,
      rawRow: null,
      lastEditedTime: new Date().toISOString(),
    })
    .run();
  return id;
}

describe('findExistingChecksums', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns an empty set without querying when the input is empty', () => {
    const result = findExistingChecksums(harness.db, []);
    expect(result.size).toBe(0);
  });

  it('returns an empty set when no checksums are present', () => {
    seedTransaction(harness.db, { checksum: 'a' });
    const result = findExistingChecksums(harness.db, ['b', 'c']);
    expect(result.size).toBe(0);
  });

  it('returns only the checksums that already exist', () => {
    seedTransaction(harness.db, { checksum: 'aaa' });
    seedTransaction(harness.db, { checksum: 'bbb' });
    seedTransaction(harness.db, { checksum: 'ccc' });

    const result = findExistingChecksums(harness.db, ['aaa', 'bbb', 'ddd']);

    expect([...result].toSorted()).toEqual(['aaa', 'bbb']);
  });

  it('ignores transactions with a null checksum', () => {
    seedTransaction(harness.db, { checksum: null });
    seedTransaction(harness.db, { checksum: 'kept' });

    const result = findExistingChecksums(harness.db, ['kept']);

    expect([...result]).toEqual(['kept']);
  });

  it('deduplicates the result even if the same checksum is asked for twice', () => {
    seedTransaction(harness.db, { checksum: 'shared' });
    const result = findExistingChecksums(harness.db, ['shared', 'shared', 'other']);
    expect(result.size).toBe(1);
    expect(result.has('shared')).toBe(true);
  });

  it('handles input larger than the 500-row batch size', () => {
    const present: string[] = [];
    for (let i = 0; i < 25; i++) {
      const checksum = `present-${i}`;
      seedTransaction(harness.db, { checksum });
      present.push(checksum);
    }

    const absent: string[] = [];
    for (let i = 0; i < 1200; i++) absent.push(`absent-${i}`);

    const result = findExistingChecksums(harness.db, [...absent, ...present]);

    expect(result.size).toBe(present.length);
    for (const c of present) expect(result.has(c)).toBe(true);
  });
});

describe('loadEntityMaps', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns empty maps when no entities exist', () => {
    const { entityLookup, aliasMap } = loadEntityMaps(harness.db);
    expect(entityLookup.size).toBe(0);
    expect(aliasMap.size).toBe(0);
  });

  it('keys the lookup by lowercased name but stores the original case', () => {
    const id = seedEntity(harness.db, { name: 'Coles Express' });

    const { entityLookup } = loadEntityMaps(harness.db);

    expect(entityLookup.get('coles express')).toEqual({ id, name: 'Coles Express' });
    expect(entityLookup.has('Coles Express')).toBe(false);
  });

  it('maps each lowercased alias to the entity name in original case', () => {
    seedEntity(harness.db, { name: 'Woolworths', aliases: 'WW, Woolies, woolworths group' });

    const { aliasMap } = loadEntityMaps(harness.db);

    expect(aliasMap.get('ww')).toBe('Woolworths');
    expect(aliasMap.get('woolies')).toBe('Woolworths');
    expect(aliasMap.get('woolworths group')).toBe('Woolworths');
  });

  it('skips entities with a null aliases column', () => {
    seedEntity(harness.db, { name: 'Solo', aliases: null });

    const { entityLookup, aliasMap } = loadEntityMaps(harness.db);

    expect(entityLookup.size).toBe(1);
    expect(aliasMap.size).toBe(0);
  });

  it('drops whitespace-only alias entries', () => {
    seedEntity(harness.db, { name: 'Aldi', aliases: 'ALDI, ,  ,aldi store' });

    const { aliasMap } = loadEntityMaps(harness.db);

    expect(aliasMap.size).toBe(2);
    expect(aliasMap.get('aldi')).toBe('Aldi');
    expect(aliasMap.get('aldi store')).toBe('Aldi');
  });

  it('keeps a single winner when two entities share an alias (insertion order not guaranteed)', () => {
    seedEntity(harness.db, { name: 'Cafe One', aliases: 'shared' });
    seedEntity(harness.db, { name: 'Cafe Two', aliases: 'shared' });

    const { aliasMap } = loadEntityMaps(harness.db);

    expect(aliasMap.size).toBe(1);
    const winner = aliasMap.get('shared');
    expect(winner === 'Cafe One' || winner === 'Cafe Two').toBe(true);
  });
});

describe('createImportEntity', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('inserts an entity with a generated UUID and returns the id + original name', () => {
    const result = createImportEntity(harness.db, 'New Vendor');

    expect(result.entityName).toBe('New Vendor');
    expect(result.entityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    const row = harness.db.select().from(entities).where(eq(entities.id, result.entityId)).get();
    expect(row?.name).toBe('New Vendor');
    expect(row?.type).toBe('company');
    expect(row?.aliases).toBeNull();
  });

  it('stamps lastEditedTime with an ISO-8601 string', () => {
    const result = createImportEntity(harness.db, 'Timestamped');
    const row = harness.db
      .select({ lastEditedTime: entities.lastEditedTime })
      .from(entities)
      .where(eq(entities.id, result.entityId))
      .get();
    expect(row?.lastEditedTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('generates a distinct id per call even when names collide', () => {
    const a = createImportEntity(harness.db, 'Same Name');
    const b = createImportEntity(harness.db, 'Same Name');
    expect(a.entityId).not.toBe(b.entityId);
  });
});

describe('insertImportTransaction', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('persists the supplied fields and round-trips them on the returned row', () => {
    const entityId = seedEntity(harness.db, { name: 'Acme' });

    const row = insertImportTransaction(harness.db, {
      description: 'Espresso',
      account: 'amex',
      amount: -4.5,
      date: '2026-02-14',
      type: 'Expense',
      tags: ['Coffee', 'Outings'],
      entityId,
      entityName: 'Acme',
      location: 'Sydney',
      rawRow: 'csv,row,here',
      checksum: 'chk-1',
    });

    expect(row.description).toBe('Espresso');
    expect(row.account).toBe('amex');
    expect(row.amount).toBe(-4.5);
    expect(row.date).toBe('2026-02-14');
    expect(row.type).toBe('Expense');
    expect(row.tags).toBe('["Coffee","Outings"]');
    expect(row.entityId).toBe(entityId);
    expect(row.entityName).toBe('Acme');
    expect(row.location).toBe('Sydney');
    expect(row.rawRow).toBe('csv,row,here');
    expect(row.checksum).toBe('chk-1');
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(row.lastEditedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('serialises tags as a JSON array (empty array when no tags supplied)', () => {
    const row = insertImportTransaction(harness.db, {
      description: 'No tags',
      account: 'amex',
      amount: -1,
      date: '2026-02-15',
      type: 'Expense',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
    });
    expect(row.tags).toBe('[]');
  });

  it('defaults optional rawRow and checksum to null when omitted', () => {
    const row = insertImportTransaction(harness.db, {
      description: 'Defaults',
      account: 'amex',
      amount: -2,
      date: '2026-02-15',
      type: 'Expense',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
    });
    expect(row.rawRow).toBeNull();
    expect(row.checksum).toBeNull();
  });

  it('coerces an empty `type` string to the empty string (does not throw)', () => {
    const row = insertImportTransaction(harness.db, {
      description: 'Untyped',
      account: 'amex',
      amount: -3,
      date: '2026-02-15',
      type: '',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
    });
    expect(row.type).toBe('');
  });

  it('honours the transactions.checksum unique index', () => {
    insertImportTransaction(harness.db, {
      description: 'first',
      account: 'amex',
      amount: -1,
      date: '2026-02-15',
      type: 'Expense',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
      checksum: 'dup',
    });

    expect(() =>
      insertImportTransaction(harness.db, {
        description: 'second',
        account: 'amex',
        amount: -1,
        date: '2026-02-15',
        type: 'Expense',
        tags: [],
        entityId: null,
        entityName: null,
        location: null,
        checksum: 'dup',
      })
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('rolls back when used inside a transaction that aborts', () => {
    expect(() =>
      harness.db.transaction(() => {
        insertImportTransaction(harness.db, {
          description: 'rolled back',
          account: 'amex',
          amount: -1,
          date: '2026-02-15',
          type: 'Expense',
          tags: [],
          entityId: null,
          entityName: null,
          location: null,
          checksum: 'rb',
        });
        throw new Error('abort');
      })
    ).toThrow('abort');

    const found = findExistingChecksums(harness.db, ['rb']);
    expect(found.size).toBe(0);
  });
});

describe('ImportTransactionPersistError', () => {
  it('exposes the offending id on the thrown instance', () => {
    const err = new ImportTransactionPersistError('abc');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ImportTransactionPersistError');
    expect(err.id).toBe('abc');
    expect(err.message).toContain('abc');
  });
});
