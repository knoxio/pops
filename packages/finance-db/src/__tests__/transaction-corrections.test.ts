/**
 * Invariant tests for the transaction-corrections service against an
 * in-memory SQLite seeded with the canonical `transaction_corrections`
 * DDL. Pure DB + service layer — no tRPC, no Express, no auth middleware.
 *
 * The DDL inlined here is the post-baseline shape — i.e. the table after
 * 0000 (baseline), 0025 (`is_active`), 0026 (mid-2025 columns), and 0027
 * (`priority`) have all been applied. The full migration journal already
 * has package coverage in `open-finance-db.test.ts`; this suite owns the
 * narrower service-contract invariants and keeps the fixture lean so each
 * test can run against a fresh table without paying the
 * hundreds-of-tables baseline cost.
 *
 * Note: `entity_id` is intentionally NOT given a FK constraint in this
 * inlined DDL — the production schema's `references(entities.id)` is
 * outside the scope of this slice's service contract and dragging the
 * `entities` table in would make the fixture brittle. The service does
 * not depend on FK enforcement for correctness.
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { TransactionCorrectionNotFoundError } from '../errors.js';
import { transactionCorrections } from '../schema.js';
import {
  adjustTransactionCorrectionConfidence,
  createOrUpdateTransactionCorrection,
  deleteTransactionCorrection,
  findAllMatchingTransactionCorrections,
  findAllMatchingTransactionCorrectionsFromDb,
  getTransactionCorrection,
  incrementTransactionCorrectionUsage,
  listTransactionCorrections,
  normalizeDescription,
  updateTransactionCorrection,
} from '../services/transaction-corrections.js';

import type { FinanceDb } from '../services/internal.js';

const TRANSACTION_CORRECTIONS_DDL = `
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  match_type text DEFAULT 'exact' NOT NULL,
  entity_id text,
  entity_name text,
  location text,
  tags text DEFAULT '[]' NOT NULL,
  transaction_type text,
  is_active integer DEFAULT 1 NOT NULL,
  confidence real DEFAULT 0.5 NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  times_applied integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  last_used_at text
);
CREATE INDEX idx_corrections_pattern ON transaction_corrections (description_pattern);
CREATE INDEX idx_corrections_priority ON transaction_corrections (priority);
CREATE INDEX idx_corrections_confidence ON transaction_corrections (confidence);
CREATE INDEX idx_corrections_times_applied ON transaction_corrections (times_applied);
`;

interface TestHarness {
  db: FinanceDb;
  raw: Database.Database;
}

function freshDb(): TestHarness {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(TRANSACTION_CORRECTIONS_DDL);
  return { db: drizzle(raw), raw };
}

function seedCorrection(
  raw: Database.Database,
  overrides: Partial<{
    id: string;
    descriptionPattern: string;
    matchType: 'exact' | 'contains' | 'regex';
    entityId: string | null;
    entityName: string | null;
    location: string | null;
    tags: string;
    transactionType: 'purchase' | 'transfer' | 'income' | null;
    isActive: 0 | 1;
    confidence: number;
    priority: number;
    timesApplied: number;
    lastUsedAt: string | null;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();
  raw
    .prepare(
      `INSERT INTO transaction_corrections (
        id, description_pattern, match_type, entity_id, entity_name, location,
        tags, transaction_type, is_active, confidence, priority, times_applied,
        last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      overrides.descriptionPattern ?? 'COFFEE SHOP',
      overrides.matchType ?? 'exact',
      overrides.entityId ?? null,
      overrides.entityName ?? null,
      overrides.location ?? null,
      overrides.tags ?? '[]',
      overrides.transactionType ?? null,
      overrides.isActive ?? 1,
      overrides.confidence ?? 0.5,
      overrides.priority ?? 0,
      overrides.timesApplied ?? 0,
      overrides.lastUsedAt ?? null
    );
  return id;
}

describe('normalizeDescription', () => {
  it('uppercases, strips digits, collapses whitespace, and trims', () => {
    expect(normalizeDescription('  starbucks   42  store 7 ')).toBe('STARBUCKS STORE');
  });

  it('returns an empty string when the input is digits + whitespace only', () => {
    expect(normalizeDescription('   123  456  ')).toBe('');
  });

  it('is idempotent — passing a normalised value through is a no-op', () => {
    const once = normalizeDescription('Café Latte 12');
    expect(normalizeDescription(once)).toBe(once);
  });
});

describe('createOrUpdateTransactionCorrection — insert path', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('normalises descriptionPattern and persists the row with defaults', () => {
    const created = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'Coffee  Shop 42',
      matchType: 'exact',
    });

    expect(created.descriptionPattern).toBe('COFFEE SHOP');
    expect(created.matchType).toBe('exact');
    expect(created.entityId).toBeNull();
    expect(created.entityName).toBeNull();
    expect(created.location).toBeNull();
    expect(created.tags).toBe('[]');
    expect(created.transactionType).toBeNull();
    expect(created.isActive).toBe(true);
    expect(created.confidence).toBe(0.5);
    expect(created.priority).toBe(0);
    expect(created.timesApplied).toBe(0);
    expect(created.lastUsedAt).toBeNull();
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('serialises tags into the on-disk JSON string', () => {
    const created = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'Foo',
      matchType: 'exact',
      tags: ['groceries', 'fresh'],
    });
    expect(created.tags).toBe(JSON.stringify(['groceries', 'fresh']));
  });

  it('honours caller-supplied entity / location / priority on insert', () => {
    const created = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'Foo',
      matchType: 'contains',
      entityId: 'entity-1',
      entityName: 'Foo Bar',
      location: 'Sydney',
      transactionType: 'purchase',
      priority: 5,
    });
    expect(created.matchType).toBe('contains');
    expect(created.entityId).toBe('entity-1');
    expect(created.entityName).toBe('Foo Bar');
    expect(created.location).toBe('Sydney');
    expect(created.transactionType).toBe('purchase');
    expect(created.priority).toBe(5);
  });
});

describe('createOrUpdateTransactionCorrection — conflict path', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('reinforces the existing row when (normalised pattern, matchType) collides', () => {
    const first = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'Foo Bar 1',
      matchType: 'exact',
      entityName: 'Original',
    });
    expect(first.confidence).toBe(0.5);
    expect(first.timesApplied).toBe(0);
    expect(first.lastUsedAt).toBeNull();

    const second = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'foo bar 999',
      matchType: 'exact',
      entityName: 'Updated',
    });

    expect(second.id).toBe(first.id);
    expect(second.confidence).toBeCloseTo(0.6, 5);
    expect(second.timesApplied).toBe(1);
    expect(second.lastUsedAt).not.toBeNull();
    expect(second.entityName).toBe('Updated');
  });

  it('caps confidence at 1.0 on the conflict path', () => {
    const id = seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.95,
    });

    const after = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'coffee',
      matchType: 'exact',
    });
    expect(after.id).toBe(id);
    expect(after.confidence).toBe(1.0);
  });

  it('overwrites tags with [] on the conflict path when input.tags is omitted (in-tree fidelity)', () => {
    const id = seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      tags: JSON.stringify(['old-tag']),
    });

    const after = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'coffee',
      matchType: 'exact',
    });
    expect(after.id).toBe(id);
    expect(after.tags).toBe('[]');
  });

  it('preserves existing entity fields when input fields are undefined', () => {
    const id = seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      entityId: 'kept-entity',
      entityName: 'Kept Name',
      location: 'Kept Loc',
      transactionType: 'income',
      priority: 7,
    });

    const after = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'coffee',
      matchType: 'exact',
    });
    expect(after.id).toBe(id);
    expect(after.entityId).toBe('kept-entity');
    expect(after.entityName).toBe('Kept Name');
    expect(after.location).toBe('Kept Loc');
    expect(after.transactionType).toBe('income');
    expect(after.priority).toBe(7);
  });

  it('reactivates a soft-deleted row on conflict (isActive flips back to true)', () => {
    seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      isActive: 0,
    });

    const after = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'coffee',
      matchType: 'exact',
    });
    expect(after.isActive).toBe(true);
  });

  it('treats matchType as part of the key — same pattern, different type, inserts a new row', () => {
    const first = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'Foo',
      matchType: 'exact',
    });
    const second = createOrUpdateTransactionCorrection(harness.db, {
      descriptionPattern: 'Foo',
      matchType: 'contains',
    });

    expect(second.id).not.toBe(first.id);
    expect(harness.db.select().from(transactionCorrections).all()).toHaveLength(2);
  });
});

describe('getTransactionCorrection', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns the row by id', () => {
    const id = seedCorrection(harness.raw);
    const row = getTransactionCorrection(harness.db, id);
    expect(row.id).toBe(id);
  });

  it('throws TransactionCorrectionNotFoundError for an unknown id', () => {
    expect(() => getTransactionCorrection(harness.db, 'missing')).toThrow(
      TransactionCorrectionNotFoundError
    );
  });

  it('carries the offending id on the thrown error', () => {
    try {
      getTransactionCorrection(harness.db, 'bad-id');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TransactionCorrectionNotFoundError);
      if (err instanceof TransactionCorrectionNotFoundError) {
        expect(err.id).toBe('bad-id');
      }
    }
  });
});

describe('listTransactionCorrections', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
    seedCorrection(harness.raw, {
      descriptionPattern: 'A',
      matchType: 'exact',
      confidence: 0.6,
      timesApplied: 3,
    });
    seedCorrection(harness.raw, {
      descriptionPattern: 'B',
      matchType: 'contains',
      confidence: 0.9,
      timesApplied: 1,
    });
    seedCorrection(harness.raw, {
      descriptionPattern: 'C',
      matchType: 'regex',
      confidence: 0.9,
      timesApplied: 10,
    });
  });

  it('orders rows by confidence DESC then timesApplied DESC and reports total', () => {
    const result = listTransactionCorrections(harness.db, { limit: 50, offset: 0 });
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.descriptionPattern)).toEqual(['C', 'B', 'A']);
  });

  it('filters by minConfidence (inclusive lower bound)', () => {
    const result = listTransactionCorrections(harness.db, {
      minConfidence: 0.9,
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.confidence >= 0.9)).toBe(true);
  });

  it('filters by matchType equality', () => {
    const result = listTransactionCorrections(harness.db, {
      matchType: 'contains',
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.matchType).toBe('contains');
  });

  it('paginates via limit + offset and reports the unpaginated total', () => {
    const page1 = listTransactionCorrections(harness.db, { limit: 2, offset: 0 });
    const page2 = listTransactionCorrections(harness.db, { limit: 2, offset: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    expect(page2.total).toBe(3);
    expect(page2.rows).toHaveLength(1);
  });

  it('returns an empty result when nothing matches the filters', () => {
    const result = listTransactionCorrections(harness.db, {
      minConfidence: 0.999,
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });
});

describe('updateTransactionCorrection', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('patches only the supplied fields', () => {
    const id = seedCorrection(harness.raw, {
      descriptionPattern: 'OLD',
      matchType: 'exact',
      confidence: 0.6,
    });

    const updated = updateTransactionCorrection(harness.db, id, {
      confidence: 0.95,
      isActive: false,
      location: 'Melbourne',
    });
    expect(updated.confidence).toBe(0.95);
    expect(updated.isActive).toBe(false);
    expect(updated.location).toBe('Melbourne');
    expect(updated.descriptionPattern).toBe('OLD');
    expect(updated.matchType).toBe('exact');
  });

  it('normalises descriptionPattern on edit', () => {
    const id = seedCorrection(harness.raw);
    const updated = updateTransactionCorrection(harness.db, id, {
      descriptionPattern: '  new   pattern 42 ',
    });
    expect(updated.descriptionPattern).toBe('NEW PATTERN');
  });

  it('treats explicit null as a value (clears the field)', () => {
    const id = seedCorrection(harness.raw, { location: 'Sydney', entityId: 'e-1' });
    const updated = updateTransactionCorrection(harness.db, id, {
      location: null,
      entityId: null,
    });
    expect(updated.location).toBeNull();
    expect(updated.entityId).toBeNull();
  });

  it('serialises tags into JSON on update', () => {
    const id = seedCorrection(harness.raw);
    const updated = updateTransactionCorrection(harness.db, id, { tags: ['x', 'y'] });
    expect(updated.tags).toBe(JSON.stringify(['x', 'y']));
  });

  it('is a no-op when the patch is empty — returns the row unchanged', () => {
    const id = seedCorrection(harness.raw, { confidence: 0.42, priority: 3 });
    const before = getTransactionCorrection(harness.db, id);
    const after = updateTransactionCorrection(harness.db, id, {});
    expect(after).toEqual(before);
  });

  it('throws TransactionCorrectionNotFoundError when the row is missing', () => {
    expect(() => updateTransactionCorrection(harness.db, 'missing', { confidence: 0.5 })).toThrow(
      TransactionCorrectionNotFoundError
    );
  });
});

describe('deleteTransactionCorrection', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('removes the row and subsequent get throws', () => {
    const id = seedCorrection(harness.raw);
    deleteTransactionCorrection(harness.db, id);
    expect(() => getTransactionCorrection(harness.db, id)).toThrow(
      TransactionCorrectionNotFoundError
    );
  });

  it('throws TransactionCorrectionNotFoundError when the row is already gone', () => {
    expect(() => deleteTransactionCorrection(harness.db, 'missing')).toThrow(
      TransactionCorrectionNotFoundError
    );
  });
});

describe('incrementTransactionCorrectionUsage', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('bumps timesApplied by 1 and stamps lastUsedAt', () => {
    const id = seedCorrection(harness.raw, { timesApplied: 7 });
    incrementTransactionCorrectionUsage(harness.db, id);

    const row = getTransactionCorrection(harness.db, id);
    expect(row.timesApplied).toBe(8);
    expect(row.lastUsedAt).not.toBeNull();
  });

  it('does not touch other rows', () => {
    const targetId = seedCorrection(harness.raw, {
      descriptionPattern: 'A',
      matchType: 'exact',
      timesApplied: 1,
    });
    const otherId = seedCorrection(harness.raw, {
      descriptionPattern: 'B',
      matchType: 'exact',
      timesApplied: 5,
    });
    incrementTransactionCorrectionUsage(harness.db, targetId);

    const target = getTransactionCorrection(harness.db, targetId);
    const other = getTransactionCorrection(harness.db, otherId);
    expect(target.timesApplied).toBe(2);
    expect(other.timesApplied).toBe(5);
    expect(other.lastUsedAt).toBeNull();
  });

  it('silently no-ops when the id does not exist', () => {
    expect(() => incrementTransactionCorrectionUsage(harness.db, 'missing')).not.toThrow();
  });
});

describe('adjustTransactionCorrectionConfidence', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('adds delta to the existing confidence', () => {
    const id = seedCorrection(harness.raw, { confidence: 0.5 });
    adjustTransactionCorrectionConfidence(harness.db, id, 0.2);
    expect(getTransactionCorrection(harness.db, id).confidence).toBeCloseTo(0.7, 5);
  });

  it('clamps the new confidence to [0, 1]', () => {
    const id = seedCorrection(harness.raw, { confidence: 0.9 });
    adjustTransactionCorrectionConfidence(harness.db, id, 0.5);
    expect(getTransactionCorrection(harness.db, id).confidence).toBe(1);
  });

  it('deletes the row when the new confidence drops below 0.3', () => {
    const id = seedCorrection(harness.raw, { confidence: 0.4 });
    adjustTransactionCorrectionConfidence(harness.db, id, -0.2);
    expect(() => getTransactionCorrection(harness.db, id)).toThrow(
      TransactionCorrectionNotFoundError
    );
  });

  it('keeps the row when the new confidence is exactly 0.3', () => {
    const id = seedCorrection(harness.raw, { confidence: 0.5 });
    adjustTransactionCorrectionConfidence(harness.db, id, -0.2);
    expect(getTransactionCorrection(harness.db, id).confidence).toBeCloseTo(0.3, 5);
  });

  it('throws TransactionCorrectionNotFoundError when the row is missing', () => {
    expect(() => adjustTransactionCorrectionConfidence(harness.db, 'missing', 0.1)).toThrow(
      TransactionCorrectionNotFoundError
    );
  });
});

describe('findAllMatchingTransactionCorrectionsFromDb', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns active matches ordered by priority ASC then id ASC', () => {
    seedCorrection(harness.raw, {
      id: 'rule-z',
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.9,
      priority: 5,
    });
    seedCorrection(harness.raw, {
      id: 'rule-a',
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.9,
      priority: 1,
    });
    seedCorrection(harness.raw, {
      id: 'rule-b',
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.9,
      priority: 1,
    });

    const matches = findAllMatchingTransactionCorrectionsFromDb(harness.db, 'Coffee 42');
    expect(matches.map((m) => m.id)).toEqual(['rule-a', 'rule-b', 'rule-z']);
  });

  it('honours minConfidence as an inclusive lower bound', () => {
    seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.7,
    });
    seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.65,
    });

    expect(findAllMatchingTransactionCorrectionsFromDb(harness.db, 'coffee', 0.7)).toHaveLength(1);
    expect(findAllMatchingTransactionCorrectionsFromDb(harness.db, 'coffee', 0.6)).toHaveLength(2);
  });

  it('ignores inactive rules', () => {
    seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.9,
      isActive: 0,
    });
    expect(findAllMatchingTransactionCorrectionsFromDb(harness.db, 'coffee')).toEqual([]);
  });

  it('honours contains and regex matchType semantics', () => {
    seedCorrection(harness.raw, {
      id: 'contains-rule',
      descriptionPattern: 'COFFEE',
      matchType: 'contains',
      confidence: 0.9,
    });
    seedCorrection(harness.raw, {
      id: 'regex-rule',
      descriptionPattern: '^STAR.*BUCKS$',
      matchType: 'regex',
      confidence: 0.9,
    });

    const containsHit = findAllMatchingTransactionCorrectionsFromDb(
      harness.db,
      'morning coffee at home'
    );
    expect(containsHit.map((r) => r.id)).toEqual(['contains-rule']);

    const regexHit = findAllMatchingTransactionCorrectionsFromDb(harness.db, 'Starbucks');
    expect(regexHit.map((r) => r.id)).toEqual(['regex-rule']);
  });

  it('silently drops regex rules with invalid patterns', () => {
    seedCorrection(harness.raw, {
      descriptionPattern: '[invalid(',
      matchType: 'regex',
      confidence: 0.9,
    });
    expect(findAllMatchingTransactionCorrectionsFromDb(harness.db, 'anything')).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.9,
    });
    expect(findAllMatchingTransactionCorrectionsFromDb(harness.db, 'restaurant')).toEqual([]);
  });
});

describe('findAllMatchingTransactionCorrections', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('groups results as [exact, contains, regex] in matchType order', () => {
    seedCorrection(harness.raw, {
      id: 'exact-rule',
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      confidence: 0.7,
    });
    seedCorrection(harness.raw, {
      id: 'contains-rule',
      descriptionPattern: 'COFFEE',
      matchType: 'contains',
      confidence: 0.95,
    });
    seedCorrection(harness.raw, {
      id: 'regex-rule',
      descriptionPattern: 'COFFEE',
      matchType: 'regex',
      confidence: 0.99,
    });

    const matches = findAllMatchingTransactionCorrections(harness.db, 'coffee');
    expect(matches.map((m) => m.id)).toEqual(['exact-rule', 'contains-rule', 'regex-rule']);
  });

  it('sorts within each group by confidence DESC then timesApplied DESC', () => {
    seedCorrection(harness.raw, {
      id: 'low-conf',
      descriptionPattern: 'COFFEE',
      matchType: 'contains',
      confidence: 0.7,
      timesApplied: 10,
    });
    seedCorrection(harness.raw, {
      id: 'high-conf-low-uses',
      descriptionPattern: 'COFFEE',
      matchType: 'contains',
      confidence: 0.95,
      timesApplied: 1,
    });
    seedCorrection(harness.raw, {
      id: 'high-conf-high-uses',
      descriptionPattern: 'COFFEE',
      matchType: 'contains',
      confidence: 0.95,
      timesApplied: 5,
    });

    const matches = findAllMatchingTransactionCorrections(harness.db, 'coffee');
    expect(matches.map((m) => m.id)).toEqual([
      'high-conf-high-uses',
      'high-conf-low-uses',
      'low-conf',
    ]);
  });

  it('ignores inactive rules across all match types', () => {
    seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'exact',
      isActive: 0,
    });
    seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'contains',
      isActive: 0,
    });
    seedCorrection(harness.raw, {
      descriptionPattern: 'COFFEE',
      matchType: 'regex',
      isActive: 0,
    });
    expect(findAllMatchingTransactionCorrections(harness.db, 'coffee')).toEqual([]);
  });

  it('silently drops regex rules with invalid patterns', () => {
    seedCorrection(harness.raw, {
      descriptionPattern: '[invalid(',
      matchType: 'regex',
    });
    expect(findAllMatchingTransactionCorrections(harness.db, 'anything')).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(findAllMatchingTransactionCorrections(harness.db, 'restaurant')).toEqual([]);
  });
});

describe('row type sanity', () => {
  it('select round-trips boolean isActive correctly', () => {
    const harness = freshDb();
    const id = seedCorrection(harness.raw, { isActive: 1 });
    const row = harness.db
      .select()
      .from(transactionCorrections)
      .where(eq(transactionCorrections.id, id))
      .get();
    expect(row?.isActive).toBe(true);
  });
});
