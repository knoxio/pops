/**
 * Smoke tests for the standalone `openFoodDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 *
 * Uses real tmpdir-backed files (not `:memory:`) because the helper runs
 * against on-disk DBs in production — the parent-directory creation and the
 * re-open idempotency path only exist for real files, so surprises surface
 * in tests, not in production.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../open-food-db.js';
import {
  ingredients,
  ingredientTags,
  ingredientWeights,
  prepStates,
  unitConversions,
} from '../schema.js';
import { listPrepStates } from '../services/prep-states.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openFoodDb', () => {
  it('creates the parent directory and opens a fresh DB', () => {
    const path = join(tmpDir, 'nested', 'sub', 'food.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openFoodDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the food slice migration', () => {
    const path = join(tmpDir, 'food.db');
    const { db, raw } = openFoodDb(path);
    try {
      expect(listPrepStates(db)).toEqual([]);
      const inserted = db
        .insert(prepStates)
        .values({ name: 'Diced', slug: 'diced' })
        .returning()
        .get();
      expect(inserted?.slug).toBe('diced');
      expect(listPrepStates(db)).toHaveLength(1);
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', () => {
    const path = join(tmpDir, 'food.db');
    const first = openFoodDb(path);
    try {
      first.db.insert(prepStates).values({ name: 'Whole', slug: 'whole' }).run();
      expect(listPrepStates(first.db)).toHaveLength(1);
    } finally {
      first.raw.close();
    }

    const second = openFoodDb(path);
    try {
      const rows = listPrepStates(second.db);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.slug).toBe('whole');
    } finally {
      second.raw.close();
    }
  });

  it('throws when the path points at a directory that cannot be opened as a DB file', () => {
    expect(() => openFoodDb(tmpDir)).toThrow();
  });

  it('applies the 0059 conversions migration — unit_conversions + ingredient_weights round-trip', () => {
    const path = join(tmpDir, 'food.db');
    const { db, raw } = openFoodDb(path);
    try {
      const conv = db
        .insert(unitConversions)
        .values({ fromUnit: 'cup', toUnit: 'ml', ratio: 240 })
        .returning()
        .get();
      expect(conv?.fromUnit).toBe('cup');
      expect(conv?.toUnit).toBe('ml');

      // The FK to ingredients is intentionally omitted from the migration,
      // so this insert succeeds even though ingredient_id=999 has no
      // matching row.
      const weight = db
        .insert(ingredientWeights)
        .values({ ingredientId: 999, unit: 'medium', grams: 50 })
        .returning()
        .get();
      expect(weight?.ingredientId).toBe(999);
      expect(weight?.grams).toBe(50);
    } finally {
      raw.close();
    }
  });

  it('enforces the ingredient_weights null-variant partial UNIQUE on re-insert', () => {
    const path = join(tmpDir, 'food.db');
    const { db, raw } = openFoodDb(path);
    try {
      db.insert(ingredientWeights).values({ ingredientId: 1, unit: 'medium', grams: 50 }).run();
      expect(() =>
        db.insert(ingredientWeights).values({ ingredientId: 1, unit: 'medium', grams: 60 }).run()
      ).toThrow();
    } finally {
      raw.close();
    }
  });

  it('enforces the unit_conversions (from_unit, to_unit) UNIQUE', () => {
    const path = join(tmpDir, 'food.db');
    const { db, raw } = openFoodDb(path);
    try {
      db.insert(unitConversions).values({ fromUnit: 'cup', toUnit: 'ml', ratio: 240 }).run();
      expect(() =>
        db.insert(unitConversions).values({ fromUnit: 'cup', toUnit: 'ml', ratio: 250 }).run()
      ).toThrow();
    } finally {
      raw.close();
    }
  });

  it('applies the 0060 ingredient_tags migration — composite-PK round-trip + FK cascade', () => {
    const path = join(tmpDir, 'food.db');
    const { db, raw } = openFoodDb(path);
    try {
      const ing = db
        .insert(ingredients)
        .values({ name: 'Banana', slug: 'banana', defaultUnit: 'count' })
        .returning()
        .get();
      expect(ing?.id).toBeGreaterThan(0);

      db.insert(ingredientTags)
        .values({ ingredientId: ing!.id, tag: 'store-section:produce' })
        .run();
      db.insert(ingredientTags).values({ ingredientId: ing!.id, tag: 'allergen:none' }).run();

      const rows = raw
        .prepare('SELECT ingredient_id, tag FROM ingredient_tags ORDER BY tag')
        .all() as { ingredient_id: number; tag: string }[];
      expect(rows).toEqual([
        { ingredient_id: ing!.id, tag: 'allergen:none' },
        { ingredient_id: ing!.id, tag: 'store-section:produce' },
      ]);

      raw.prepare('DELETE FROM ingredients WHERE id = ?').run(ing!.id);
      const { n } = raw.prepare('SELECT count(*) AS n FROM ingredient_tags').get() as {
        n: number;
      };
      expect(n).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('enforces the ingredient_tags composite primary key', () => {
    const path = join(tmpDir, 'food.db');
    const { db, raw } = openFoodDb(path);
    try {
      const ing = db
        .insert(ingredients)
        .values({ name: 'Apple', slug: 'apple', defaultUnit: 'count' })
        .returning()
        .get();
      db.insert(ingredientTags).values({ ingredientId: ing!.id, tag: 'vegan' }).run();
      expect(() =>
        db.insert(ingredientTags).values({ ingredientId: ing!.id, tag: 'vegan' }).run()
      ).toThrow();
    } finally {
      raw.close();
    }
  });
});
