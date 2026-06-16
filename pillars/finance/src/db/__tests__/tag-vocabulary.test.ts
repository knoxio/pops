/**
 * Invariant tests for the tag-vocabulary service against an in-memory
 * SQLite seeded with the canonical `tag_vocabulary` DDL. Pure DB +
 * service layer — no tRPC, no Express, no auth middleware.
 *
 * The DDL is inlined rather than read from the package's own
 * `migrations/0026_little_frank_castle.sql` because that file mixes the
 * `tag_vocabulary` CREATE with the `transaction_tag_rules` CREATE +
 * seed inserts — the test owns its own fixtures so it can exercise the
 * service contract in isolation. `open-finance-db.test.ts` currently
 * only asserts that `tag_vocabulary` exists after migrations run, so it
 * does NOT catch DDL drift between this inlined schema and the shipped
 * migration. A schema-level assertion (column types, defaults) is left
 * as a follow-up.
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { tagVocabulary } from '../schema.js';
import { listVocabularyTags, upsertVocabularyTag } from '../services/tag-vocabulary.js';

import type { FinanceDb } from '../services/internal.js';

const TAG_VOCABULARY_DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX idx_tag_vocabulary_active ON tag_vocabulary (is_active);
`;

interface TestHarness {
  db: FinanceDb;
  raw: Database.Database;
}

function freshDb(): TestHarness {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(TAG_VOCABULARY_DDL);
  return { db: drizzle(raw), raw };
}

describe('listVocabularyTags', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns an empty array when the vocabulary is empty', () => {
    expect(listVocabularyTags(harness.db)).toEqual([]);
  });

  it('returns every active tag in the table', () => {
    upsertVocabularyTag(harness.db, 'Groceries', 'seed');
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    upsertVocabularyTag(harness.db, 'Rent', 'user');

    const tags = listVocabularyTags(harness.db);
    expect(tags).toHaveLength(3);
    expect(new Set(tags)).toEqual(new Set(['Groceries', 'Coffee', 'Rent']));
  });

  it('honours is_active=false rows by hiding them', () => {
    upsertVocabularyTag(harness.db, 'Active', 'seed');
    upsertVocabularyTag(harness.db, 'Retired', 'seed');

    harness.raw.prepare(`UPDATE tag_vocabulary SET is_active = 0 WHERE tag = ?`).run('Retired');

    expect(listVocabularyTags(harness.db)).toEqual(['Active']);
  });
});

describe('upsertVocabularyTag — insert path', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('creates a row with the supplied source and is_active=true', () => {
    upsertVocabularyTag(harness.db, 'Subscriptions', 'user');

    const rows = harness.db.select().from(tagVocabulary).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tag: 'Subscriptions',
      source: 'user',
      isActive: true,
    });
  });

  it('persists distinct rows for distinct tags', () => {
    upsertVocabularyTag(harness.db, 'Subscriptions', 'user');
    upsertVocabularyTag(harness.db, 'Donations', 'user');

    expect(new Set(listVocabularyTags(harness.db))).toEqual(
      new Set(['Subscriptions', 'Donations'])
    );
  });

  it('records the supplied source on first insert', () => {
    upsertVocabularyTag(harness.db, 'Seeded', 'seed');
    upsertVocabularyTag(harness.db, 'UserAdded', 'user');

    const seededRow = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'Seeded'))
      .get();
    const userRow = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'UserAdded'))
      .get();
    expect(seededRow?.source).toBe('seed');
    expect(userRow?.source).toBe('user');
  });
});

describe('upsertVocabularyTag — conflict path', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('is idempotent — repeated upsert of the same tag does not duplicate', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    upsertVocabularyTag(harness.db, 'Coffee', 'user');

    const rows = harness.db.select().from(tagVocabulary).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tag).toBe('Coffee');
  });

  it('flips is_active back to true on conflict', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    harness.raw.prepare(`UPDATE tag_vocabulary SET is_active = 0 WHERE tag = ?`).run('Coffee');
    expect(listVocabularyTags(harness.db)).toEqual([]);

    upsertVocabularyTag(harness.db, 'Coffee', 'user');
    expect(listVocabularyTags(harness.db)).toEqual(['Coffee']);
  });

  it('leaves source untouched on conflict — seed tag reactivated by a user keeps source=seed', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    harness.raw.prepare(`UPDATE tag_vocabulary SET is_active = 0 WHERE tag = ?`).run('Coffee');
    upsertVocabularyTag(harness.db, 'Coffee', 'user');

    const row = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'Coffee'))
      .get();
    expect(row?.source).toBe('seed');
    expect(row?.isActive).toBe(true);
  });

  it('preserves created_at on conflict', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    const beforeRow = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'Coffee'))
      .get();

    upsertVocabularyTag(harness.db, 'Coffee', 'user');
    const afterRow = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'Coffee'))
      .get();

    expect(afterRow?.createdAt).toBe(beforeRow?.createdAt);
  });
});
