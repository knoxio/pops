/**
 * Invariant tests for the imports persistence helpers.
 *
 * Entities are no longer mirrored in finance — `buildEntityMaps` and
 * `buildDefaultTagsByEntity` are PURE transforms over a contact set fetched
 * live from the contacts pillar, so they need no DB. `findExistingChecksums`
 * and `insertImportTransaction` run against an in-memory `transactions` table
 * (no entity FK — the column is plain text, matching the post-0057 schema).
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { ImportTransactionPersistError } from '../errors.js';
import { transactions } from '../schema.js';
import {
  buildDefaultTagsByEntity,
  buildEntityMaps,
  findExistingChecksums,
  insertImportTransaction,
} from '../services/imports.js';

import type { ContactEntity } from '../../api/contacts/client.js';
import type { FinanceDb } from '../services/internal.js';

const SCHEMA_DDL = `
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
  last_edited_time text NOT NULL
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

function contact(over: Partial<ContactEntity> & { name: string }): ContactEntity {
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
    expect(findExistingChecksums(harness.db, []).size).toBe(0);
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
    expect([...findExistingChecksums(harness.db, ['kept'])]).toEqual(['kept']);
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

describe('buildEntityMaps', () => {
  it('returns empty maps for an empty contact set', () => {
    const { entityLookup, aliasMap } = buildEntityMaps([]);
    expect(entityLookup.size).toBe(0);
    expect(aliasMap.size).toBe(0);
  });

  it('keys the lookup by lowercased name but stores the original case', () => {
    const { entityLookup } = buildEntityMaps([contact({ id: 'e1', name: 'Coles Express' })]);
    expect(entityLookup.get('coles express')).toEqual({ id: 'e1', name: 'Coles Express' });
    expect(entityLookup.has('Coles Express')).toBe(false);
  });

  it('maps each lowercased alias to the entity name in original case', () => {
    const { aliasMap } = buildEntityMaps([
      contact({ name: 'Woolworths', aliases: ['WW', 'Woolies', 'woolworths group'] }),
    ]);
    expect(aliasMap.get('ww')).toBe('Woolworths');
    expect(aliasMap.get('woolies')).toBe('Woolworths');
    expect(aliasMap.get('woolworths group')).toBe('Woolworths');
  });

  it('drops whitespace-only alias entries', () => {
    const { aliasMap } = buildEntityMaps([
      contact({ name: 'Aldi', aliases: ['ALDI', ' ', '', 'aldi store'] }),
    ]);
    expect(aliasMap.size).toBe(2);
    expect(aliasMap.get('aldi')).toBe('Aldi');
    expect(aliasMap.get('aldi store')).toBe('Aldi');
  });

  it('keeps a single winner when two contacts share an alias', () => {
    const { aliasMap } = buildEntityMaps([
      contact({ name: 'Cafe One', aliases: ['shared'] }),
      contact({ name: 'Cafe Two', aliases: ['shared'] }),
    ]);
    expect(aliasMap.size).toBe(1);
    const winner = aliasMap.get('shared');
    expect(winner === 'Cafe One' || winner === 'Cafe Two').toBe(true);
  });
});

describe('buildDefaultTagsByEntity', () => {
  it('maps contact id to its defaultTags, skipping contacts with none', () => {
    const map = buildDefaultTagsByEntity([
      contact({ id: 'a', name: 'A', defaultTags: ['food', 'rent'] }),
      contact({ id: 'b', name: 'B', defaultTags: [] }),
    ]);
    expect(map.get('a')).toEqual(['food', 'rent']);
    expect(map.has('b')).toBe(false);
  });
});

describe('insertImportTransaction', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('persists the supplied fields and round-trips them, incl. a non-local entity id', () => {
    const row = insertImportTransaction(harness.db, {
      description: 'Espresso',
      account: 'amex',
      amount: -4.5,
      date: '2026-02-14',
      type: 'Expense',
      tags: ['Coffee', 'Outings'],
      // A contacts entity id with no local referent — the dropped FK lets it in.
      entityId: 'contacts-entity-id',
      entityName: 'Acme',
      location: 'Sydney',
      rawRow: 'csv,row,here',
      checksum: 'chk-1',
    });

    expect(row.tags).toBe('["Coffee","Outings"]');
    expect(row.entityId).toBe('contacts-entity-id');
    expect(row.entityName).toBe('Acme');
    expect(row.checksum).toBe('chk-1');
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('serialises empty tags as a JSON array and defaults rawRow/checksum to null', () => {
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
    expect(row.rawRow).toBeNull();
    expect(row.checksum).toBeNull();
  });

  it('honours the transactions.checksum unique index', () => {
    const base = {
      account: 'amex',
      amount: -1,
      date: '2026-02-15',
      type: 'Expense',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
      checksum: 'dup',
    };
    insertImportTransaction(harness.db, { ...base, description: 'first' });
    expect(() => insertImportTransaction(harness.db, { ...base, description: 'second' })).toThrow(
      /UNIQUE constraint failed/
    );
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

    expect(findExistingChecksums(harness.db, ['rb']).size).toBe(0);
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
