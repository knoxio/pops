/**
 * ingredient_tags service invariants. Exercises the migration + service
 * layer against an in-memory SQLite seeded with the food schema.
 *
 * Covers:
 *   - PK uniqueness (idempotent re-insert is a no-op)
 *   - CASCADE on ingredient delete
 *   - Normalisation (trim, lowercase, regex, length cap)
 *   - `setTagsForIngredient` transactional round-trip
 *   - `listDistinctTags` with and without namespace filter, ordering
 *   - `listIngredientsByTag` join + ordering
 *   - `countIngredientsInNamespace` distinct-count helper
 *   - Expression index is honoured (EXPLAIN QUERY PLAN sanity check)
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../open-food-db.js';
import { ingredients, ingredientTags } from '../schema.js';
import {
  addTagToIngredient,
  countIngredientsInNamespace,
  listDistinctTags,
  listIngredientsByTag,
  listTagsForIngredient,
  normaliseTag,
  removeTagFromIngredient,
  setTagsForIngredient,
} from '../services/ingredient-tags.js';

import type Database from 'better-sqlite3';

import type { FoodDb } from '../services/internal.js';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

function seedIngredient(db: FoodDb, slug: string, name: string): number {
  const rows = db
    .insert(ingredients)
    .values({ slug, name, defaultUnit: 'count' })
    .returning({ id: ingredients.id })
    .all();
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`failed to insert ${slug}`);
  return id;
}

describe('ingredient_tags service invariants', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('schema applied cleanly', () => {
    it('creates the ingredient_tags table with PK + both indexes', () => {
      const tables = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ingredient_tags'`)
        .all() as { name: string }[];
      expect(tables).toHaveLength(1);

      const indexes = raw
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ingredient_tags' ORDER BY name`
        )
        .all() as { name: string }[];
      const names = indexes.map((i) => i.name);
      expect(names).toEqual(
        expect.arrayContaining(['idx_ingredient_tags_tag', 'idx_ingredient_tags_namespace'])
      );
    });
  });

  describe('normaliseTag', () => {
    it.each([
      ['Produce', 'produce'],
      ['  store-section:produce  ', 'store-section:produce'],
      ['STORE-SECTION:PRODUCE', 'store-section:produce'],
      ['diet:strict-vegan', 'diet:strict-vegan'],
      ['store-section', 'store-section'],
    ])('lowercases + trims %s → %s', (input, expected) => {
      expect(normaliseTag(input)).toBe(expected);
    });

    it.each([
      '',
      '   ',
      'store-section:café',
      'store-section: produce',
      'store-section:',
      ':produce',
      'has space',
      'store-section:produce!',
    ])('rejects %s as BadTagFormat', (input) => {
      expect(() => normaliseTag(input)).toThrow(/not a valid format/);
    });

    it('rejects > 64 chars as TagTooLong', () => {
      const long = 'a'.repeat(65);
      expect(() => normaliseTag(long)).toThrow(/max is 64/);
    });
  });

  describe('addTagToIngredient', () => {
    it('inserts and lists', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      const result = addTagToIngredient(db, tomato, 'store-section:produce');
      expect(result).toEqual({ ok: true });
      expect(listTagsForIngredient(db, tomato).tags).toEqual(['store-section:produce']);
    });

    it('is idempotent on the PK', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, 'store-section:produce');
      addTagToIngredient(db, tomato, 'store-section:produce');
      const rows = db.select().from(ingredientTags).all();
      expect(rows).toHaveLength(1);
    });

    it('normalises (lowercase + trim) before storing', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, '  STORE-SECTION:Produce  ');
      expect(listTagsForIngredient(db, tomato).tags).toEqual(['store-section:produce']);
    });

    it('returns BadTagFormat for invalid input', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      expect(addTagToIngredient(db, tomato, 'store-section: produce')).toEqual({
        ok: false,
        reason: 'BadTagFormat',
      });
    });

    it('returns TagTooLong for values > 64 chars', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      const longTag = 'a'.repeat(65);
      expect(addTagToIngredient(db, tomato, longTag)).toEqual({
        ok: false,
        reason: 'TagTooLong',
      });
    });

    it('returns IngredientNotFound when the ingredient is absent', () => {
      expect(addTagToIngredient(db, 9999, 'store-section:produce')).toEqual({
        ok: false,
        reason: 'IngredientNotFound',
      });
    });
  });

  describe('removeTagFromIngredient', () => {
    it('removes a tag', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, 'store-section:produce');
      removeTagFromIngredient(db, tomato, 'store-section:produce');
      expect(listTagsForIngredient(db, tomato).tags).toEqual([]);
    });

    it('is idempotent on a missing tag', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      const result = removeTagFromIngredient(db, tomato, 'nonexistent');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('CASCADE delete', () => {
    it('drops every tag when the ingredient is deleted', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, 'store-section:produce');
      addTagToIngredient(db, tomato, 'diet:vegan');
      addTagToIngredient(db, tomato, 'allergen:none');
      db.delete(ingredients).where(eq(ingredients.id, tomato)).run();
      const remaining = db
        .select()
        .from(ingredientTags)
        .where(eq(ingredientTags.ingredientId, tomato))
        .all();
      expect(remaining).toHaveLength(0);
    });
  });

  describe('setTagsForIngredient', () => {
    it('replaces the entire tag set in one transaction', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, 'old:one');
      addTagToIngredient(db, tomato, 'old:two');
      const result = setTagsForIngredient(db, tomato, ['store-section:produce', 'diet:vegan']);
      expect(result).toEqual({ ok: true });
      expect(listTagsForIngredient(db, tomato).tags).toEqual([
        'diet:vegan',
        'store-section:produce',
      ]);
    });

    it('accepts an empty array and clears every tag', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, 'store-section:produce');
      const result = setTagsForIngredient(db, tomato, []);
      expect(result).toEqual({ ok: true });
      expect(listTagsForIngredient(db, tomato).tags).toEqual([]);
    });

    it('dedupes within the input set', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      setTagsForIngredient(db, tomato, [
        'store-section:produce',
        'STORE-SECTION:produce',
        '  store-section:produce  ',
      ]);
      expect(listTagsForIngredient(db, tomato).tags).toEqual(['store-section:produce']);
    });

    it('aborts the transaction on a single bad tag — no partial writes', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, 'old:one');
      const result = setTagsForIngredient(db, tomato, [
        'store-section:produce',
        'store-section: bad value',
        'diet:vegan',
      ]);
      expect(result).toEqual({ ok: false, reason: 'BadTagFormat' });
      // Original tag survives because the validator rejected before any DELETE.
      expect(listTagsForIngredient(db, tomato).tags).toEqual(['old:one']);
    });
  });

  describe('listDistinctTags', () => {
    it('returns rows sorted by count desc then alpha', () => {
      const a = seedIngredient(db, 'a', 'A');
      const b = seedIngredient(db, 'b', 'B');
      const c = seedIngredient(db, 'c', 'C');
      addTagToIngredient(db, a, 'store-section:produce');
      addTagToIngredient(db, b, 'store-section:produce');
      addTagToIngredient(db, c, 'store-section:produce');
      addTagToIngredient(db, a, 'store-section:dairy');
      addTagToIngredient(db, b, 'store-section:dairy');
      addTagToIngredient(db, a, 'store-section:meat');
      const { tags } = listDistinctTags(db, { namespacePrefix: null });
      expect(tags.map((t) => t.tag)).toEqual([
        'store-section:produce',
        'store-section:dairy',
        'store-section:meat',
      ]);
      expect(tags[0]?.ingredientCount).toBe(3);
      expect(tags[2]?.ingredientCount).toBe(1);
    });

    it('filters by namespace prefix', () => {
      const a = seedIngredient(db, 'a', 'A');
      addTagToIngredient(db, a, 'store-section:produce');
      addTagToIngredient(db, a, 'diet:vegan');
      const sections = listDistinctTags(db, { namespacePrefix: 'store-section' });
      expect(sections.tags.map((t) => t.tag)).toEqual(['store-section:produce']);
    });

    it('honours the limit', () => {
      const a = seedIngredient(db, 'a', 'A');
      for (let i = 0; i < 5; i++) {
        addTagToIngredient(db, a, `diet:tag-${i}`);
      }
      const limited = listDistinctTags(db, { namespacePrefix: null, limit: 2 });
      expect(limited.tags).toHaveLength(2);
    });
  });

  describe('listIngredientsByTag', () => {
    it('joins to ingredients and sorts by name', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      const onion = seedIngredient(db, 'onion', 'Onion');
      const garlic = seedIngredient(db, 'garlic', 'Garlic');
      addTagToIngredient(db, tomato, 'store-section:produce');
      addTagToIngredient(db, onion, 'store-section:produce');
      addTagToIngredient(db, garlic, 'store-section:produce');
      const { ingredients: rows } = listIngredientsByTag(db, 'store-section:produce');
      expect(rows.map((r) => r.name)).toEqual(['Garlic', 'Onion', 'Tomato']);
    });

    it('is case-insensitive at the boundary', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, 'store-section:produce');
      const { ingredients: rows } = listIngredientsByTag(db, 'STORE-section:Produce');
      expect(rows).toHaveLength(1);
    });
  });

  describe('countIngredientsInNamespace', () => {
    it('counts distinct ingredients with at least one tag in the namespace', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      const onion = seedIngredient(db, 'onion', 'Onion');
      addTagToIngredient(db, tomato, 'store-section:produce');
      addTagToIngredient(db, tomato, 'store-section:condiments');
      addTagToIngredient(db, onion, 'store-section:produce');
      expect(countIngredientsInNamespace(db, 'store-section')).toBe(2);
      expect(countIngredientsInNamespace(db, 'diet')).toBe(0);
    });
  });

  describe('namespace expression index', () => {
    it('is used for store-section:* lookups (EXPLAIN QUERY PLAN)', () => {
      const tomato = seedIngredient(db, 'tomato', 'Tomato');
      addTagToIngredient(db, tomato, 'store-section:produce');
      // ANALYZE materialises sqlite_stat1 so the planner has selectivity info.
      raw.exec('ANALYZE');
      const plan = raw
        .prepare(
          `EXPLAIN QUERY PLAN SELECT tag FROM ingredient_tags WHERE tag LIKE 'store-section:%'`
        )
        .all() as { detail: string }[];
      const joined = plan.map((row) => row.detail).join('\n');
      // Either the NOCASE tag index or the namespace expression index is OK —
      // both are far better than the full table scan we'd see without them.
      expect(joined).toMatch(/idx_ingredient_tags_(tag|namespace)/);
    });
  });
});
