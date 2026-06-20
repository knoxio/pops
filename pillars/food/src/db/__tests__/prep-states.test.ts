/**
 * Invariant tests for the prep-states service against an in-memory SQLite
 * seeded with the canonical `prep_states` migration. Pure DB + service
 * layer — no tRPC, no Express, no auth middleware.
 *
 * Higher-level tRPC coverage lives in pops-api's own integration suite
 * until the cutover PR routes it through this package.
 *
 * The `prep_states` CREATE TABLE is read from the package-local migration
 * copy at `packages/food-db/migrations/0058_high_sentinel.sql`. A drift
 * guard in `food-db-quality.yml` keeps that file byte-identical to the
 * shared journal copy at
 * `apps/pops-api/src/db/drizzle-migrations/0058_high_sentinel.sql` until
 * the eventual journal-split + deletion PR retires the shared one.
 *
 * The 0058 SQL also creates ingredients/variants/aliases/slug_registry —
 * the test re-uses the full file because the additional tables are
 * harmless to a prep_states unit suite and applying the same SQL the
 * shared journal applies is the strongest possible match.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { PrepStateNotFoundError } from '../errors.js';
import { prepStates } from '../schema.js';
import { getPrepState, listPrepStates } from '../services/prep-states.js';

import type { FoodDb } from '../services/internal.js';

const FOOD_MIGRATION = join(__dirname, '../../../migrations/0058_high_sentinel.sql');

function freshDb(): FoodDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(FOOD_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

interface Seed {
  name: string;
  slug: string;
}

function seed(db: FoodDb, rows: Seed[]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    const inserted = db
      .insert(prepStates)
      .values({ name: row.name, slug: row.slug })
      .returning()
      .get();
    if (inserted === undefined) throw new Error('insert returned no row');
    ids.push(inserted.id);
  }
  return ids;
}

describe('listPrepStates', () => {
  let db: FoodDb;

  beforeEach(() => {
    db = freshDb();
  });

  it('returns the empty array against a fresh schema', () => {
    expect(listPrepStates(db)).toEqual([]);
  });

  it('returns rows in id-ascending order regardless of insert sequence', () => {
    seed(db, [
      { name: 'Diced', slug: 'diced' },
      { name: 'Whole', slug: 'whole' },
      { name: 'Sliced', slug: 'sliced' },
    ]);

    const rows = listPrepStates(db);

    expect(rows.map((r) => r.slug)).toEqual(['diced', 'whole', 'sliced']);
    expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].toSorted((a, b) => a - b));
  });

  it('surfaces every row — no implicit pagination', () => {
    const seeds = Array.from({ length: 25 }, (_, i) => ({
      name: `State ${i}`,
      slug: `state-${i}`,
    }));
    seed(db, seeds);

    expect(listPrepStates(db)).toHaveLength(25);
  });
});

describe('getPrepState', () => {
  let db: FoodDb;
  let dicedId: number;
  let wholeId: number;

  beforeEach(() => {
    db = freshDb();
    const ids = seed(db, [
      { name: 'Diced', slug: 'diced' },
      { name: 'Whole', slug: 'whole' },
    ]);
    const first = ids[0];
    const second = ids[1];
    if (first === undefined || second === undefined) {
      throw new Error('seed did not return the expected number of ids');
    }
    dicedId = first;
    wholeId = second;
  });

  it('returns the row matching the id', () => {
    const row = getPrepState(db, dicedId);

    expect(row.slug).toBe('diced');
    expect(row.name).toBe('Diced');
  });

  it('throws PrepStateNotFoundError when no row matches', () => {
    expect(() => getPrepState(db, 999_999)).toThrow(PrepStateNotFoundError);
  });

  it('the thrown error carries the queried id', () => {
    try {
      getPrepState(db, 42);
      throw new Error('expected getPrepState to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PrepStateNotFoundError);
      if (err instanceof PrepStateNotFoundError) {
        expect(err.id).toBe(42);
        expect(err.name).toBe('PrepStateNotFoundError');
      }
    }
  });

  it('does not match a deleted row', () => {
    db.delete(prepStates).where(eq(prepStates.id, wholeId)).run();

    expect(() => getPrepState(db, wholeId)).toThrow(PrepStateNotFoundError);
  });
});
