/**
 * Invariant tests for the transaction-tag-rules service against an
 * in-memory SQLite seeded with the canonical `transaction_tag_rules`,
 * `tag_vocabulary`, and `entities` DDL. Pure DB + service layer — no tRPC,
 * no Express, no auth middleware.
 *
 * Three foreign-key dimensions are exercised:
 *   (1) `entity_id` -> `entities(id)` is the only SQL-level FK on the table
 *       and must be honoured when `foreign_keys = ON`. A bad `entityId`
 *       must be rejected by SQLite, not silently accepted.
 *   (2) `tags` JSON references against `tag_vocabulary.tag` are a logical
 *       relationship only — there is no SQL FK, so the table accepts tags
 *       that are not in the vocabulary. We assert that explicitly so the
 *       cutover (PR 3) does not surprise the in-tree consumer, which
 *       enforces the relationship at the preview layer.
 *   (3) `tag_vocabulary` itself is co-seeded so the sibling-table fixture
 *       proves the package's barrel re-export from N5 is functional and
 *       so future PRs that wire the preview layer here have a reference
 *       harness.
 *
 * The DDL is inlined for the same reason as the wish-list and
 * tag-vocabulary suites: the package's own `0026_little_frank_castle.sql`
 * mixes table creation with `INSERT OR IGNORE` seed data we do not want
 * leaking into these unit tests.
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { TransactionTagRuleNotFoundError } from '../errors.js';
import { tagVocabulary, transactionTagRules } from '../schema.js';
import { upsertVocabularyTag } from '../services/tag-vocabulary.js';
import {
  createTransactionTagRule,
  deleteTransactionTagRule,
  disableTransactionTagRule,
  getTransactionTagRule,
  listTransactionTagRules,
  updateTransactionTagRule,
} from '../services/transaction-tag-rules.js';

import type { FinanceDb } from '../services/internal.js';

const ENTITIES_DDL = `
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
`;

const TAG_VOCABULARY_DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX idx_tag_vocabulary_active ON tag_vocabulary (is_active);
`;

const TRANSACTION_TAG_RULES_DDL = `
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  match_type text DEFAULT 'exact' NOT NULL,
  entity_id text,
  tags text DEFAULT '[]' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  confidence real DEFAULT 0.5 NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  times_applied integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  last_used_at text,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON UPDATE no action ON DELETE set null
);
CREATE INDEX idx_tag_rules_pattern ON transaction_tag_rules (description_pattern);
CREATE INDEX idx_tag_rules_entity_id ON transaction_tag_rules (entity_id);
CREATE INDEX idx_tag_rules_priority ON transaction_tag_rules (priority);
CREATE INDEX idx_tag_rules_confidence ON transaction_tag_rules (confidence);
CREATE INDEX idx_tag_rules_times_applied ON transaction_tag_rules (times_applied);
`;

interface TestHarness {
  db: FinanceDb;
  raw: Database.Database;
}

function freshDb(): TestHarness {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(ENTITIES_DDL);
  raw.exec(TAG_VOCABULARY_DDL);
  raw.exec(TRANSACTION_TAG_RULES_DDL);
  return { db: drizzle(raw), raw };
}

function seedEntity(harness: TestHarness, id: string, name: string): void {
  harness.raw
    .prepare(`INSERT INTO entities (id, name, type, last_edited_time) VALUES (?, ?, 'company', ?)`)
    .run(id, name, new Date().toISOString());
}

describe('createTransactionTagRule', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('inserts a row with the supplied fields, JSON-encoded tags, and a generated UUID', () => {
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'UBER',
      matchType: 'contains',
      tags: ['Transport', 'Eat Out'],
      confidence: 0.8,
      priority: 5,
    });

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created.descriptionPattern).toBe('UBER');
    expect(created.matchType).toBe('contains');
    expect(created.tags).toBe(JSON.stringify(['Transport', 'Eat Out']));
    expect(created.confidence).toBe(0.8);
    expect(created.priority).toBe(5);
    expect(created.timesApplied).toBe(0);
    expect(created.isActive).toBe(true);
    expect(created.entityId).toBeNull();
  });

  it('applies legacy defaults: confidence=0.95, isActive=true, priority=0', () => {
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'COLES',
      matchType: 'exact',
      tags: ['Groceries'],
    });

    expect(created.confidence).toBe(0.95);
    expect(created.isActive).toBe(true);
    expect(created.priority).toBe(0);
  });

  it('honours the entity_id FK when the referenced entity exists', () => {
    seedEntity(harness, 'ent-1', 'Acme');
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'ACME',
      matchType: 'exact',
      entityId: 'ent-1',
      tags: ['Subscriptions'],
    });
    expect(created.entityId).toBe('ent-1');
  });

  it('rejects an insert that references a non-existent entity (SQLite FK)', () => {
    expect(() =>
      createTransactionTagRule(harness.db, {
        descriptionPattern: 'GHOST',
        matchType: 'exact',
        entityId: 'does-not-exist',
        tags: ['Unknown'],
      })
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('accepts tags not present in tag_vocabulary — there is no SQL FK on tags', () => {
    upsertVocabularyTag(harness.db, 'Groceries', 'seed');
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'WEIRDPATTERN',
      matchType: 'exact',
      tags: ['NotInVocabulary'],
    });
    expect(JSON.parse(created.tags)).toEqual(['NotInVocabulary']);
  });
});

describe('getTransactionTagRule', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns the row when present', () => {
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'STARBUCKS',
      matchType: 'contains',
      tags: ['Coffee'],
    });
    const fetched = getTransactionTagRule(harness.db, created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.descriptionPattern).toBe('STARBUCKS');
  });

  it('throws TransactionTagRuleNotFoundError when the id is unknown', () => {
    expect(() => getTransactionTagRule(harness.db, 'no-such-id')).toThrow(
      TransactionTagRuleNotFoundError
    );
  });

  it('attaches the id to the typed error', () => {
    try {
      getTransactionTagRule(harness.db, 'missing-id');
      expect.fail('expected TransactionTagRuleNotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(TransactionTagRuleNotFoundError);
      if (err instanceof TransactionTagRuleNotFoundError) {
        expect(err.id).toBe('missing-id');
      }
    }
  });
});

describe('listTransactionTagRules', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns an empty array when the table is empty', () => {
    expect(listTransactionTagRules(harness.db)).toEqual([]);
  });

  it('orders by (confidence DESC, times_applied DESC) to match the legacy router', () => {
    const lowConf = createTransactionTagRule(harness.db, {
      descriptionPattern: 'A',
      matchType: 'exact',
      tags: ['x'],
      confidence: 0.3,
    });
    const midConf = createTransactionTagRule(harness.db, {
      descriptionPattern: 'B',
      matchType: 'exact',
      tags: ['x'],
      confidence: 0.7,
    });
    const highConf = createTransactionTagRule(harness.db, {
      descriptionPattern: 'C',
      matchType: 'exact',
      tags: ['x'],
      confidence: 0.95,
    });
    harness.raw
      .prepare(`UPDATE transaction_tag_rules SET times_applied = 50 WHERE id = ?`)
      .run(midConf.id);

    const ordered = listTransactionTagRules(harness.db);
    expect(ordered.map((r) => r.id)).toEqual([highConf.id, midConf.id, lowConf.id]);
  });

  it('breaks confidence ties by times_applied DESC', () => {
    const first = createTransactionTagRule(harness.db, {
      descriptionPattern: 'A',
      matchType: 'exact',
      tags: ['x'],
      confidence: 0.5,
    });
    const second = createTransactionTagRule(harness.db, {
      descriptionPattern: 'B',
      matchType: 'exact',
      tags: ['x'],
      confidence: 0.5,
    });
    harness.raw
      .prepare(`UPDATE transaction_tag_rules SET times_applied = 99 WHERE id = ?`)
      .run(second.id);

    const ordered = listTransactionTagRules(harness.db);
    expect(ordered.map((r) => r.id)).toEqual([second.id, first.id]);
  });
});

describe('updateTransactionTagRule', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('patches only the supplied fields, JSON-re-encoding tags on the way through', () => {
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'X',
      matchType: 'exact',
      tags: ['old'],
      confidence: 0.5,
    });

    const updated = updateTransactionTagRule(harness.db, created.id, {
      tags: ['new', 'tags'],
      confidence: 0.9,
    });

    expect(updated.tags).toBe(JSON.stringify(['new', 'tags']));
    expect(updated.confidence).toBe(0.9);
    expect(updated.descriptionPattern).toBe('X');
    expect(updated.matchType).toBe('exact');
  });

  it('treats an empty patch as a no-op but still returns the current row', () => {
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'Y',
      matchType: 'exact',
      tags: ['a'],
    });
    const result = updateTransactionTagRule(harness.db, created.id, {});
    expect(result.id).toBe(created.id);
    expect(result.tags).toBe(JSON.stringify(['a']));
  });

  it('clears entity_id when passed null', () => {
    seedEntity(harness, 'ent-2', 'Beta');
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'BETA',
      matchType: 'exact',
      entityId: 'ent-2',
      tags: ['x'],
    });

    const cleared = updateTransactionTagRule(harness.db, created.id, { entityId: null });
    expect(cleared.entityId).toBeNull();
  });

  it('rejects an update that points entity_id at a non-existent entity', () => {
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'Z',
      matchType: 'exact',
      tags: ['x'],
    });
    expect(() => updateTransactionTagRule(harness.db, created.id, { entityId: 'phantom' })).toThrow(
      /FOREIGN KEY constraint failed/
    );
  });

  it('throws TransactionTagRuleNotFoundError for an unknown id', () => {
    expect(() => updateTransactionTagRule(harness.db, 'missing', { confidence: 0.1 })).toThrow(
      TransactionTagRuleNotFoundError
    );
  });
});

describe('disableTransactionTagRule', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('flips is_active to false and leaves the row in place', () => {
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'D',
      matchType: 'exact',
      tags: ['x'],
    });

    disableTransactionTagRule(harness.db, created.id);

    const row = harness.db
      .select()
      .from(transactionTagRules)
      .where(eq(transactionTagRules.id, created.id))
      .get();
    expect(row?.isActive).toBe(false);
  });

  it('throws when the id is unknown', () => {
    expect(() => disableTransactionTagRule(harness.db, 'missing')).toThrow(
      TransactionTagRuleNotFoundError
    );
  });
});

describe('deleteTransactionTagRule', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('hard-deletes the row', () => {
    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'E',
      matchType: 'exact',
      tags: ['x'],
    });

    deleteTransactionTagRule(harness.db, created.id);
    expect(listTransactionTagRules(harness.db)).toEqual([]);
  });

  it('throws when the id is unknown', () => {
    expect(() => deleteTransactionTagRule(harness.db, 'ghost')).toThrow(
      TransactionTagRuleNotFoundError
    );
  });
});

describe('tag_vocabulary sibling-table integration', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('exposes both schemas from the package barrel — tagVocabulary and transactionTagRules are wired', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    upsertVocabularyTag(harness.db, 'Transport', 'seed');

    const created = createTransactionTagRule(harness.db, {
      descriptionPattern: 'UBER',
      matchType: 'contains',
      tags: ['Transport'],
    });

    const vocabRows = harness.db.select({ tag: tagVocabulary.tag }).from(tagVocabulary).all();
    const ruleRow = harness.db
      .select()
      .from(transactionTagRules)
      .where(eq(transactionTagRules.id, created.id))
      .get();
    expect(new Set(vocabRows.map((r) => r.tag))).toEqual(new Set(['Coffee', 'Transport']));
    expect(JSON.parse(ruleRow?.tags ?? '[]')).toEqual(['Transport']);
  });

  it('does NOT reject a rule whose tags reference a missing vocabulary entry (no SQL FK on tags)', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    expect(() =>
      createTransactionTagRule(harness.db, {
        descriptionPattern: 'X',
        matchType: 'exact',
        tags: ['DefinitelyNotSeeded'],
      })
    ).not.toThrow();
  });
});
