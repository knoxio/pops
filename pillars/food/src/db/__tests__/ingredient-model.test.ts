/**
 * Ingredient model invariant tests — exercises the migration + service layer
 * against an in-memory SQLite seeded with the food schema. No Redis, no API
 * process, no external services.
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  IngredientCycleError,
  IngredientHierarchyDepthExceeded,
  InvalidSlugError,
  SlugAlreadyRegisteredError,
} from '../errors.js';
import { openFoodDb } from '../open-food-db.js';
import { ingredients, prepStates, slugRegistry } from '../schema.js';
import {
  changeIngredientParent,
  createIngredient,
  deleteIngredient,
  type FoodDb,
  renameIngredientSlug,
} from '../services/ingredients.js';
import { createPrepState } from '../services/prep-states.js';
import { createVariant } from '../services/variants.js';

import type Database from 'better-sqlite3';

// All food-domain migrations are applied: drizzle's TypeScript types reflect
// the full schema (e.g. the shelf-life columns on ingredient_variants), so
// inserts via drizzle would fail against a partial DB even when a suite does
// not exercise the newer columns.

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

describe('ingredient model invariants', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('schema applied cleanly', () => {
    it('creates all five tables', () => {
      const tables = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'ingredient_aliases',
          'ingredient_variants',
          'ingredients',
          'prep_states',
          'slug_registry',
        ])
      );
    });

    it('creates the expected indexes', () => {
      const indexes = raw
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`
        )
        .all() as { name: string }[];
      const names = indexes.map((i) => i.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'idx_aliases_alias',
          'idx_ingredients_name',
          'idx_ingredients_parent',
          'idx_slug_registry_kind_target',
          'idx_variants_ingredient',
          'idx_variants_name',
          'uq_aliases_alias_ingredient',
          'uq_aliases_alias_variant',
          'uq_variants_ingredient_slug',
        ])
      );
    });
  });

  describe('slug validation', () => {
    it('rejects a non-kebab-case slug', () => {
      expect(() =>
        createIngredient(db, { name: 'Banana', slug: 'Banana', defaultUnit: 'count' })
      ).toThrow(InvalidSlugError);
    });

    it('rejects an empty slug', () => {
      expect(() =>
        createIngredient(db, { name: 'Banana', slug: '', defaultUnit: 'count' })
      ).toThrow(InvalidSlugError);
    });

    it('rejects a slug with leading hyphen', () => {
      expect(() =>
        createIngredient(db, { name: 'Banana', slug: '-banana', defaultUnit: 'count' })
      ).toThrow(InvalidSlugError);
    });

    it('accepts a multi-segment kebab slug', () => {
      const row = createIngredient(db, {
        name: 'San Marzano',
        slug: 'san-marzano-tomato',
        defaultUnit: 'g',
      });
      expect(row.slug).toBe('san-marzano-tomato');
    });
  });

  describe('slug_registry — cross-kind uniqueness', () => {
    it('throws SlugAlreadyRegisteredError on duplicate ingredient slug', () => {
      createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
      try {
        createIngredient(db, { name: 'Banana 2', slug: 'banana', defaultUnit: 'count' });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(SlugAlreadyRegisteredError);
        expect((err as SlugAlreadyRegisteredError).kind).toBe('ingredient');
      }
    });

    it('throws SlugAlreadyRegisteredError when prep_state collides with existing ingredient', () => {
      createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
      try {
        createPrepState(db, { name: 'Banana prep', slug: 'banana' });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(SlugAlreadyRegisteredError);
        expect((err as SlugAlreadyRegisteredError).kind).toBe('ingredient');
      }
    });

    it('renameIngredientSlug updates both tables atomically', () => {
      const ing = createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
      renameIngredientSlug(db, 'banana', 'musa');
      const ingRow = db.select().from(ingredients).where(eq(ingredients.id, ing.id)).all();
      const regRow = db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'musa')).all();
      const oldReg = db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'banana')).all();
      expect(ingRow[0]?.slug).toBe('musa');
      expect(regRow[0]?.kind).toBe('ingredient');
      expect(regRow[0]?.targetId).toBe(ing.id);
      expect(oldReg).toHaveLength(0);
    });

    it('renameIngredientSlug rolls back if the new slug is already taken', () => {
      createIngredient(db, { name: 'Apple', slug: 'apple', defaultUnit: 'count' });
      createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
      expect(() => renameIngredientSlug(db, 'banana', 'apple')).toThrow(SlugAlreadyRegisteredError);
      // The ingredient row keeps its old slug.
      const bananaRow = db.select().from(ingredients).where(eq(ingredients.slug, 'banana')).all();
      expect(bananaRow).toHaveLength(1);
    });

    it('deleteIngredient removes the slug_registry row in the same transaction', () => {
      const ing = createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
      deleteIngredient(db, ing.id);
      const reg = db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'banana')).all();
      expect(reg).toHaveLength(0);
    });
  });

  describe('ingredient hierarchy — cycle + depth', () => {
    it('IngredientCycleError on changeIngredientParent setting self as parent', () => {
      const root = createIngredient(db, {
        name: 'Tomato',
        slug: 'tomato',
        defaultUnit: 'g',
      });
      expect(() => changeIngredientParent(db, root.id, root.id)).toThrow(IngredientCycleError);
    });

    it('IngredientCycleError on changeIngredientParent forming a transitive cycle', () => {
      const a = createIngredient(db, { name: 'A', slug: 'a-ingredient', defaultUnit: 'g' });
      const b = createIngredient(db, {
        name: 'B',
        slug: 'b-ingredient',
        defaultUnit: 'g',
        parentId: a.id,
      });
      const c = createIngredient(db, {
        name: 'C',
        slug: 'c-ingredient',
        defaultUnit: 'g',
        parentId: b.id,
      });
      // Re-parenting `a` under `c` would form a cycle: a → c → b → a.
      expect(() => changeIngredientParent(db, a.id, c.id)).toThrow(IngredientCycleError);
    });

    it('IngredientHierarchyDepthExceeded on a 4th-level insert', () => {
      const lvl1 = createIngredient(db, { name: 'L1', slug: 'l1', defaultUnit: 'g' });
      const lvl2 = createIngredient(db, {
        name: 'L2',
        slug: 'l2',
        defaultUnit: 'g',
        parentId: lvl1.id,
      });
      const lvl3 = createIngredient(db, {
        name: 'L3',
        slug: 'l3',
        defaultUnit: 'g',
        parentId: lvl2.id,
      });
      expect(() =>
        createIngredient(db, { name: 'L4', slug: 'l4', defaultUnit: 'g', parentId: lvl3.id })
      ).toThrow(IngredientHierarchyDepthExceeded);
    });
  });

  describe('ingredient_variants — per-parent slug scoping', () => {
    it('rejects two variants with the same slug under the same ingredient', () => {
      const banana = createIngredient(db, {
        name: 'Banana',
        slug: 'banana',
        defaultUnit: 'count',
      });
      createVariant(db, {
        ingredientId: banana.id,
        name: 'Raw',
        slug: 'raw',
        defaultUnit: 'count',
      });
      expect(() =>
        createVariant(db, {
          ingredientId: banana.id,
          name: 'Raw again',
          slug: 'raw',
          defaultUnit: 'count',
        })
      ).toThrow();
    });

    it('accepts the same variant slug under DIFFERENT ingredients', () => {
      const banana = createIngredient(db, {
        name: 'Banana',
        slug: 'banana',
        defaultUnit: 'count',
      });
      const apple = createIngredient(db, {
        name: 'Apple',
        slug: 'apple',
        defaultUnit: 'count',
      });
      const bananaRaw = createVariant(db, {
        ingredientId: banana.id,
        name: 'Raw',
        slug: 'raw',
        defaultUnit: 'count',
      });
      const appleRaw = createVariant(db, {
        ingredientId: apple.id,
        name: 'Raw',
        slug: 'raw',
        defaultUnit: 'count',
      });
      expect(bananaRaw.slug).toBe('raw');
      expect(appleRaw.slug).toBe('raw');
    });

    it('rejects a variant whose ingredient_id does not exist', () => {
      expect(() =>
        createVariant(db, {
          ingredientId: 9999,
          name: 'Orphan',
          slug: 'orphan',
          defaultUnit: 'g',
        })
      ).toThrow();
    });
  });

  describe('FK enforcement on delete', () => {
    it('refuses to delete an ingredient that has extant variants', () => {
      const banana = createIngredient(db, {
        name: 'Banana',
        slug: 'banana',
        defaultUnit: 'count',
      });
      createVariant(db, {
        ingredientId: banana.id,
        name: 'Raw',
        slug: 'raw',
        defaultUnit: 'count',
      });
      expect(() => deleteIngredient(db, banana.id)).toThrow();
      expect(db.select().from(ingredients).where(eq(ingredients.id, banana.id)).all()).toHaveLength(
        1
      );
    });

    it('refuses to delete an ingredient that has extant aliases', () => {
      const banana = createIngredient(db, {
        name: 'Banana',
        slug: 'banana',
        defaultUnit: 'count',
      });
      raw
        .prepare(
          `INSERT INTO ingredient_aliases (ingredient_id, alias, source) VALUES (?, ?, 'user')`
        )
        .run(banana.id, 'platano');
      expect(() => deleteIngredient(db, banana.id)).toThrow();
    });
  });

  describe('ingredient_aliases — XOR CHECK + UNIQUE', () => {
    let bananaId: number;
    let bananaRawVariantId: number;

    beforeEach(() => {
      const b = createIngredient(db, {
        name: 'Banana',
        slug: 'banana',
        defaultUnit: 'count',
      });
      bananaId = b.id;
      const v = createVariant(db, {
        ingredientId: bananaId,
        name: 'Raw',
        slug: 'raw',
        defaultUnit: 'count',
      });
      bananaRawVariantId = v.id;
    });

    it('rejects an alias with BOTH ingredient_id and variant_id set', () => {
      expect(() =>
        raw
          .prepare(
            `INSERT INTO ingredient_aliases (ingredient_id, variant_id, alias, source) VALUES (?, ?, ?, 'user')`
          )
          .run(bananaId, bananaRawVariantId, 'both')
      ).toThrow();
    });

    it('rejects an alias with NEITHER ingredient_id nor variant_id set', () => {
      expect(() =>
        raw
          .prepare(`INSERT INTO ingredient_aliases (alias, source) VALUES (?, 'user')`)
          .run('orphan-alias')
      ).toThrow();
    });

    it('rejects a duplicate (alias, ingredient_id) under the same target', () => {
      raw
        .prepare(
          `INSERT INTO ingredient_aliases (ingredient_id, alias, source) VALUES (?, ?, 'user')`
        )
        .run(bananaId, 'platano');
      expect(() =>
        raw
          .prepare(
            `INSERT INTO ingredient_aliases (ingredient_id, alias, source) VALUES (?, ?, 'user')`
          )
          .run(bananaId, 'platano')
      ).toThrow();
    });
  });

  describe('service guard — direct INSERT bypasses registry', () => {
    it('a raw INSERT into ingredients does NOT populate slug_registry', () => {
      raw
        .prepare(
          `INSERT INTO ingredients (name, slug, default_unit) VALUES ('Banana', 'banana', 'count')`
        )
        .run();
      // The row exists but is invisible to the slug_registry — proving the
      // registry is service-maintained, not trigger-maintained.
      expect(db.select().from(ingredients).all()).toHaveLength(1);
      expect(db.select().from(slugRegistry).all()).toHaveLength(0);
    });

    it('a raw INSERT into prep_states does NOT populate slug_registry', () => {
      raw.prepare(`INSERT INTO prep_states (name, slug) VALUES ('Diced', 'diced')`).run();
      expect(db.select().from(prepStates).all()).toHaveLength(1);
      expect(db.select().from(slugRegistry).all()).toHaveLength(0);
    });
  });
});
