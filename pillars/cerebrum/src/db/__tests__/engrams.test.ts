/**
 * Invariant tests for the engrams data-access service against an
 * in-memory SQLite seeded with the package-local engrams baseline
 * migration. Covers CRUD on `engram_index` + auxiliaries, list filters,
 * cascade behaviour, link insert/delete, and the detector-scan helper
 * `loadActiveEngrams`.
 *
 * The engrams baseline is read from the pillar's
 * `migrations/0050_engrams_baseline.sql`. The
 * `embeddings_vec` virtual table is NOT seeded here — vector search is
 * out of scope for the data-access slice (it's wired up in the
 * `openCerebrumDb` happy path tested separately).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { engramIndex, engramLinks, engramScopes, engramTags } from '../schema.js';
import {
  deleteEngramIndex,
  deleteEngramLinkPair,
  existsEngram,
  findIndexRow,
  getEngram,
  hydrateEngrams,
  insertEngramLink,
  listEngrams,
  loadActiveEngrams,
  upsertEngramIndex,
} from '../services/engrams.js';

import type { UpsertEngramArgs } from '../services/engrams-types.js';
import type { CerebrumDb } from '../services/internal.js';

const ENGRAMS_MIGRATION = join(__dirname, '../../../migrations/0050_engrams_baseline.sql');

function freshDb(): CerebrumDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(ENGRAMS_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

function makeArgs(
  overrides: Partial<UpsertEngramArgs> & Pick<UpsertEngramArgs, 'id'>
): UpsertEngramArgs {
  return {
    filePath: `notes/${overrides.id}.md`,
    type: 'note',
    source: 'manual',
    status: 'active',
    template: null,
    createdAt: '2026-05-10T10:00:00Z',
    modifiedAt: '2026-05-10T10:00:00Z',
    title: 'T',
    contentHash: 'h',
    bodyHash: 'bh',
    wordCount: 3,
    customFields: {},
    scopes: ['work'],
    tags: [],
    links: [],
    ...overrides,
  };
}

describe('upsertEngramIndex', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a row with its scopes/tags/links and round-trips through hydrate', () => {
    upsertEngramIndex(
      db,
      makeArgs({
        id: 'eng_20260510_1000_a',
        scopes: ['work', 'personal'],
        tags: ['idea', 'sprint'],
        links: ['eng_other'],
      })
    );

    const engram = getEngram(db, 'eng_20260510_1000_a');
    expect(engram).not.toBeNull();
    expect(engram?.scopes.toSorted()).toEqual(['personal', 'work']);
    expect(engram?.tags.toSorted()).toEqual(['idea', 'sprint']);
    expect(engram?.links).toEqual(['eng_other']);
  });

  it('deduplicates scopes/tags/links before insert', () => {
    upsertEngramIndex(
      db,
      makeArgs({
        id: 'eng_dup',
        scopes: ['work', 'work', 'personal'],
        tags: ['x', 'x'],
        links: ['eng_o', 'eng_o'],
      })
    );

    const engram = getEngram(db, 'eng_dup');
    expect(engram?.scopes.toSorted()).toEqual(['personal', 'work']);
    expect(engram?.tags).toEqual(['x']);
    expect(engram?.links).toEqual(['eng_o']);
  });

  it('replaces auxiliaries on re-upsert (idempotent index rebuild)', () => {
    upsertEngramIndex(
      db,
      makeArgs({ id: 'eng_replace', scopes: ['old'], tags: ['tag-old'], links: [] })
    );
    upsertEngramIndex(
      db,
      makeArgs({ id: 'eng_replace', scopes: ['new'], tags: ['tag-new'], links: ['eng_target'] })
    );

    const engram = getEngram(db, 'eng_replace');
    expect(engram?.scopes).toEqual(['new']);
    expect(engram?.tags).toEqual(['tag-new']);
    expect(engram?.links).toEqual(['eng_target']);
    expect(db.select().from(engramScopes).all()).toHaveLength(1);
    expect(db.select().from(engramTags).all()).toHaveLength(1);
    expect(db.select().from(engramLinks).all()).toHaveLength(1);
  });

  it('stores customFields as JSON when non-empty and null when empty', () => {
    upsertEngramIndex(db, makeArgs({ id: 'eng_cf', customFields: { foo: 1 } }));
    upsertEngramIndex(db, makeArgs({ id: 'eng_empty', customFields: {} }));

    const rows = db.select().from(engramIndex).all();
    const withFields = rows.find((r) => r.id === 'eng_cf');
    const empty = rows.find((r) => r.id === 'eng_empty');
    expect(withFields?.customFields).toBe(JSON.stringify({ foo: 1 }));
    expect(empty?.customFields).toBeNull();
  });
});

describe('findIndexRow / existsEngram', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns null / false when the engram is absent', () => {
    expect(findIndexRow(db, 'missing')).toBeNull();
    expect(existsEngram(db, 'missing')).toBe(false);
  });

  it('returns the row / true when present', () => {
    upsertEngramIndex(db, makeArgs({ id: 'eng_present' }));
    expect(findIndexRow(db, 'eng_present')?.id).toBe('eng_present');
    expect(existsEngram(db, 'eng_present')).toBe(true);
  });
});

describe('deleteEngramIndex', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns 0 when the engram does not exist (idempotent)', () => {
    expect(deleteEngramIndex(db, 'missing')).toBe(0);
  });

  it('cascades to scopes/tags/outbound-links and sweeps inbound link rows', () => {
    upsertEngramIndex(db, makeArgs({ id: 'eng_a', scopes: ['s'], tags: ['t'], links: ['eng_b'] }));
    upsertEngramIndex(db, makeArgs({ id: 'eng_b', scopes: ['s'], tags: ['t'], links: ['eng_a'] }));

    expect(deleteEngramIndex(db, 'eng_a')).toBe(1);
    expect(
      db
        .select()
        .from(engramScopes)
        .all()
        .some((r) => r.engramId === 'eng_a')
    ).toBe(false);
    expect(
      db
        .select()
        .from(engramTags)
        .all()
        .some((r) => r.engramId === 'eng_a')
    ).toBe(false);
    expect(
      db
        .select()
        .from(engramLinks)
        .all()
        .some((r) => r.targetId === 'eng_a')
    ).toBe(false);
    expect(existsEngram(db, 'eng_b')).toBe(true);
  });
});

describe('listEngrams', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    upsertEngramIndex(
      db,
      makeArgs({
        id: 'eng_1',
        type: 'note',
        title: 'apple pie',
        status: 'active',
        scopes: ['work'],
        tags: ['food'],
        createdAt: '2026-05-10T10:00:00Z',
        modifiedAt: '2026-05-10T10:00:00Z',
      })
    );
    upsertEngramIndex(
      db,
      makeArgs({
        id: 'eng_2',
        type: 'note',
        title: 'banana split',
        status: 'archived',
        scopes: ['personal'],
        tags: ['food', 'idea'],
        createdAt: '2026-05-11T10:00:00Z',
        modifiedAt: '2026-05-12T10:00:00Z',
      })
    );
    upsertEngramIndex(
      db,
      makeArgs({
        id: 'eng_3',
        type: 'task',
        title: 'cherry rant',
        status: 'active',
        scopes: ['work', 'personal'],
        tags: ['idea'],
        createdAt: '2026-05-12T10:00:00Z',
        modifiedAt: '2026-05-11T10:00:00Z',
      })
    );
  });

  it('returns all rows with total when no filter is supplied', () => {
    const result = listEngrams(db);
    expect(result.total).toBe(3);
    expect(result.engrams).toHaveLength(3);
  });

  it('filters by type', () => {
    expect(listEngrams(db, { type: 'task' }).engrams.map((e) => e.id)).toEqual(['eng_3']);
  });

  it('filters by status', () => {
    expect(listEngrams(db, { status: 'archived' }).engrams.map((e) => e.id)).toEqual(['eng_2']);
  });

  it('filters by scope (intersection)', () => {
    const result = listEngrams(db, { scopes: ['personal'] });
    expect(result.engrams.map((e) => e.id).toSorted()).toEqual(['eng_2', 'eng_3']);
  });

  it('filters by tag (intersection)', () => {
    const result = listEngrams(db, { tags: ['idea'] });
    expect(result.engrams.map((e) => e.id).toSorted()).toEqual(['eng_2', 'eng_3']);
  });

  it('substring-matches title via search', () => {
    expect(listEngrams(db, { search: 'pie' }).engrams.map((e) => e.id)).toEqual(['eng_1']);
  });

  it('filters by ids and respects ids.length when limit is unspecified', () => {
    const result = listEngrams(db, { ids: ['eng_1', 'eng_3'] });
    expect(result.engrams.map((e) => e.id).toSorted()).toEqual(['eng_1', 'eng_3']);
    expect(result.total).toBe(2);
  });

  it('orders by modified_at desc by default', () => {
    expect(listEngrams(db).engrams.map((e) => e.id)).toEqual(['eng_2', 'eng_3', 'eng_1']);
  });

  it('honours an explicit sort.field and direction', () => {
    expect(
      listEngrams(db, { sort: { field: 'title', direction: 'asc' } }).engrams.map((e) => e.id)
    ).toEqual(['eng_1', 'eng_2', 'eng_3']);
  });

  it('paginates with limit + offset on top of filters', () => {
    const page = listEngrams(db, {
      sort: { field: 'created_at', direction: 'asc' },
      limit: 1,
      offset: 1,
    });
    expect(page.engrams.map((e) => e.id)).toEqual(['eng_2']);
    expect(page.total).toBe(3);
  });
});

describe('hydrateEngrams', () => {
  it('returns an empty array when given no rows', () => {
    const db = freshDb();
    expect(hydrateEngrams(db, [])).toEqual([]);
  });
});

describe('insertEngramLink / deleteEngramLinkPair', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    upsertEngramIndex(db, makeArgs({ id: 'eng_a' }));
    upsertEngramIndex(db, makeArgs({ id: 'eng_b' }));
  });

  it('is idempotent under repeated insertion', () => {
    insertEngramLink(db, 'eng_a', 'eng_b');
    insertEngramLink(db, 'eng_a', 'eng_b');
    expect(db.select().from(engramLinks).all()).toHaveLength(1);
  });

  it('deletes both directions of a pair', () => {
    insertEngramLink(db, 'eng_a', 'eng_b');
    insertEngramLink(db, 'eng_b', 'eng_a');
    expect(db.select().from(engramLinks).all()).toHaveLength(2);
    deleteEngramLinkPair(db, 'eng_a', 'eng_b');
    expect(db.select().from(engramLinks).all()).toHaveLength(0);
  });
});

describe('loadActiveEngrams', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns an empty array when nothing is seeded', () => {
    expect(loadActiveEngrams(db)).toEqual([]);
  });

  it('excludes archived and consolidated rows but keeps active and stale', () => {
    upsertEngramIndex(db, makeArgs({ id: 'eng_active', status: 'active' }));
    upsertEngramIndex(db, makeArgs({ id: 'eng_stale', status: 'stale' }));
    upsertEngramIndex(db, makeArgs({ id: 'eng_archived', status: 'archived' }));
    upsertEngramIndex(db, makeArgs({ id: 'eng_consolidated', status: 'consolidated' }));

    const ids = loadActiveEngrams(db)
      .map((e) => e.id)
      .toSorted();
    expect(ids).toEqual(['eng_active', 'eng_stale']);
  });

  it('hydrates scopes and tags for each active row', () => {
    upsertEngramIndex(
      db,
      makeArgs({ id: 'eng_a', scopes: ['s1', 's2'], tags: ['t1'], status: 'active' })
    );
    const [active] = loadActiveEngrams(db);
    expect(active?.scopes.toSorted()).toEqual(['s1', 's2']);
    expect(active?.tags).toEqual(['t1']);
  });
});
