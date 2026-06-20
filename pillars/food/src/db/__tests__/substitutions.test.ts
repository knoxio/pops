/**
 * PRD-109 invariant tests — exercise the migration + service layer for the
 * substitutions schema against an in-memory SQLite seeded with PRD-106 +
 * PRD-107 + PRD-109 migrations. No Redis, no API process.
 */

import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { CannotSubstituteSelf } from '../errors.js';
import { openFoodDb } from '../open-food-db.js';
import { substitutions } from '../schema.js';
import { createIngredient, type FoodDb } from '../services/ingredients.js';
import { createRecipe, deleteRecipe } from '../services/recipes.js';
import { createSubstitution, deleteRecipeScopedSubstitutions } from '../services/substitutions.js';
import { createVariant } from '../services/variants.js';

import type Database from 'better-sqlite3';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

interface Seed {
  butterId: number;
  oliveOilId: number;
  oliveOilExtraVirginId: number;
  recipeId: number;
}

function seedFixtures(db: FoodDb): Seed {
  const butter = createIngredient(db, { name: 'Butter', slug: 'butter', defaultUnit: 'g' });
  const oliveOil = createIngredient(db, {
    name: 'Olive oil',
    slug: 'olive-oil',
    defaultUnit: 'ml',
  });
  const evoo = createVariant(db, {
    ingredientId: oliveOil.id,
    name: 'Extra virgin',
    slug: 'extra-virgin',
    defaultUnit: 'ml',
  });
  const { recipe } = createRecipe(db, {
    slug: 'cookies',
    firstVersion: { title: 'Cookies', bodyDsl: '@recipe(cookies)' },
  });
  return {
    butterId: butter.id,
    oliveOilId: oliveOil.id,
    oliveOilExtraVirginId: evoo.id,
    recipeId: recipe.id,
  };
}

describe('PRD-109 — substitution model invariants', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('schema applied cleanly', () => {
    it('creates the substitutions table', () => {
      const row = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='substitutions'`)
        .get() as { name: string } | undefined;
      expect(row?.name).toBe('substitutions');
    });

    it('creates the partial UNIQUE indexes from the PRD', () => {
      const indexes = raw
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='substitutions' ORDER BY name`
        )
        .all() as { name: string }[];
      const names = indexes.map((i) => i.name);
      for (const expected of [
        'idx_subs_from_ing',
        'idx_subs_from_var',
        'idx_subs_scope_recipe',
        'uq_subs_global_ing_ing',
        'uq_subs_global_ing_var',
        'uq_subs_global_var_ing',
        'uq_subs_global_var_var',
        'uq_subs_recipe_ing_ing',
        'uq_subs_recipe_ing_var',
        'uq_subs_recipe_var_ing',
        'uq_subs_recipe_var_var',
      ]) {
        expect(names).toContain(expected);
      }
    });
  });

  describe('XOR CHECKs — exactly one side per endpoint', () => {
    it('rejects a row with BOTH from_ingredient_id AND from_variant_id set', () => {
      const seed = seedFixtures(db);
      expect(() =>
        raw
          .prepare(
            `INSERT INTO substitutions (from_ingredient_id, from_variant_id, to_ingredient_id, scope)
             VALUES (?, ?, ?, 'global')`
          )
          .run(seed.butterId, seed.oliveOilExtraVirginId, seed.oliveOilId)
      ).toThrow();
    });

    it('rejects a row with NEITHER from side set', () => {
      const seed = seedFixtures(db);
      expect(() =>
        raw
          .prepare(`INSERT INTO substitutions (to_ingredient_id, scope) VALUES (?, 'global')`)
          .run(seed.oliveOilId)
      ).toThrow();
    });

    it('rejects a row with BOTH to_ingredient_id AND to_variant_id set', () => {
      const seed = seedFixtures(db);
      expect(() =>
        raw
          .prepare(
            `INSERT INTO substitutions (from_ingredient_id, to_ingredient_id, to_variant_id, scope)
             VALUES (?, ?, ?, 'global')`
          )
          .run(seed.butterId, seed.oliveOilId, seed.oliveOilExtraVirginId)
      ).toThrow();
    });

    it('rejects a row with NEITHER to side set', () => {
      const seed = seedFixtures(db);
      expect(() =>
        raw
          .prepare(`INSERT INTO substitutions (from_ingredient_id, scope) VALUES (?, 'global')`)
          .run(seed.butterId)
      ).toThrow();
    });
  });

  describe('scope CHECK', () => {
    it('rejects scope="recipe" with no recipe_id', () => {
      const seed = seedFixtures(db);
      expect(() =>
        raw
          .prepare(
            `INSERT INTO substitutions (from_ingredient_id, to_ingredient_id, scope) VALUES (?, ?, 'recipe')`
          )
          .run(seed.butterId, seed.oliveOilId)
      ).toThrow();
    });

    it('rejects scope="global" with a recipe_id set', () => {
      const seed = seedFixtures(db);
      expect(() =>
        raw
          .prepare(
            `INSERT INTO substitutions (from_ingredient_id, to_ingredient_id, scope, recipe_id) VALUES (?, ?, 'global', ?)`
          )
          .run(seed.butterId, seed.oliveOilId, seed.recipeId)
      ).toThrow();
    });

    it('rejects an unknown scope value', () => {
      const seed = seedFixtures(db);
      expect(() =>
        raw
          .prepare(
            `INSERT INTO substitutions (from_ingredient_id, to_ingredient_id, scope) VALUES (?, ?, 'lol')`
          )
          .run(seed.butterId, seed.oliveOilId)
      ).toThrow();
    });
  });

  describe('ratio CHECK', () => {
    it('rejects ratio = 0', () => {
      const seed = seedFixtures(db);
      expect(() =>
        createSubstitution(db, {
          from: { ingredientId: seed.butterId },
          to: { ingredientId: seed.oliveOilId },
          ratio: 0,
        })
      ).toThrow();
    });

    it('rejects a negative ratio', () => {
      const seed = seedFixtures(db);
      expect(() =>
        createSubstitution(db, {
          from: { ingredientId: seed.butterId },
          to: { ingredientId: seed.oliveOilId },
          ratio: -0.5,
        })
      ).toThrow();
    });

    it('accepts ratios < 1 (asymmetric replacement)', () => {
      const seed = seedFixtures(db);
      const sub = createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        ratio: 0.75,
      });
      expect(sub.ratio).toBe(0.75);
    });
  });

  describe('partial UNIQUE — duplicates rejected within scope', () => {
    it('rejects two global subs for the same (from_ingredient → to_ingredient) pair', () => {
      const seed = seedFixtures(db);
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
      });
      expect(() =>
        createSubstitution(db, {
          from: { ingredientId: seed.butterId },
          to: { ingredientId: seed.oliveOilId },
          ratio: 0.5,
        })
      ).toThrow();
    });

    it('rejects two global subs for the same (from_ingredient → to_variant) pair', () => {
      const seed = seedFixtures(db);
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { variantId: seed.oliveOilExtraVirginId },
      });
      expect(() =>
        createSubstitution(db, {
          from: { ingredientId: seed.butterId },
          to: { variantId: seed.oliveOilExtraVirginId },
        })
      ).toThrow();
    });

    it('rejects two recipe-scoped subs for the same (from, to, recipe_id)', () => {
      const seed = seedFixtures(db);
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        scope: 'recipe',
        recipeId: seed.recipeId,
      });
      expect(() =>
        createSubstitution(db, {
          from: { ingredientId: seed.butterId },
          to: { ingredientId: seed.oliveOilId },
          scope: 'recipe',
          recipeId: seed.recipeId,
        })
      ).toThrow();
    });

    it('allows a global AND a recipe-scoped sub for the same (from, to)', () => {
      const seed = seedFixtures(db);
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
      });
      const recipeSub = createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        scope: 'recipe',
        recipeId: seed.recipeId,
        ratio: 0.5,
      });
      expect(recipeSub.scope).toBe('recipe');
      expect(recipeSub.recipeId).toBe(seed.recipeId);
    });

    it('allows the same (from, to) pair under two different recipes', () => {
      const seed = seedFixtures(db);
      const { recipe: r2 } = createRecipe(db, {
        slug: 'pancakes',
        firstVersion: { title: 'Pancakes', bodyDsl: '@recipe(pancakes)' },
      });
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        scope: 'recipe',
        recipeId: seed.recipeId,
      });
      const sub2 = createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        scope: 'recipe',
        recipeId: r2.id,
      });
      expect(sub2.recipeId).toBe(r2.id);
    });
  });

  describe('CannotSubstituteSelf', () => {
    it('rejects an ingredient → ingredient sub where both sides are the same ingredient', () => {
      const seed = seedFixtures(db);
      try {
        createSubstitution(db, {
          from: { ingredientId: seed.butterId },
          to: { ingredientId: seed.butterId },
        });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(CannotSubstituteSelf);
        expect((err as CannotSubstituteSelf).side).toBe('ingredient');
        expect((err as CannotSubstituteSelf).id).toBe(seed.butterId);
      }
    });

    it('rejects a variant → variant sub where both sides are the same variant', () => {
      const seed = seedFixtures(db);
      expect(() =>
        createSubstitution(db, {
          from: { variantId: seed.oliveOilExtraVirginId },
          to: { variantId: seed.oliveOilExtraVirginId },
        })
      ).toThrow(CannotSubstituteSelf);
    });

    it('allows ingredient → variant under the same ingredient (not self)', () => {
      const seed = seedFixtures(db);
      const sub = createSubstitution(db, {
        from: { ingredientId: seed.oliveOilId },
        to: { variantId: seed.oliveOilExtraVirginId },
      });
      expect(sub.fromIngredientId).toBe(seed.oliveOilId);
      expect(sub.toVariantId).toBe(seed.oliveOilExtraVirginId);
    });
  });

  describe('context_tags — JSON storage', () => {
    it('round-trips an array of strings via createSubstitution', () => {
      const seed = seedFixtures(db);
      const sub = createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        contextTags: ['savory', 'baking'],
      });
      expect(sub.contextTags).toEqual(['savory', 'baking']);
    });

    it('defaults to an empty array on the column when no tags are supplied', () => {
      const seed = seedFixtures(db);
      const sub = createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
      });
      expect(sub.contextTags).toEqual([]);
      const stored = db
        .select({ tags: substitutions.contextTags })
        .from(substitutions)
        .where(eq(substitutions.id, sub.id))
        .all();
      expect(stored[0]?.tags).toBe('[]');
    });

    it('json_each query pattern filters subs by intersection', () => {
      const seed = seedFixtures(db);
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        contextTags: ['savory', 'baking'],
      });
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { variantId: seed.oliveOilExtraVirginId },
        contextTags: ['sweet'],
      });
      const hits = raw
        .prepare(
          `SELECT id FROM substitutions
           WHERE EXISTS (SELECT 1 FROM json_each(context_tags) WHERE value = 'savory')`
        )
        .all() as { id: number }[];
      expect(hits).toHaveLength(1);
    });
  });

  describe('FK enforcement', () => {
    it('refuses to insert a recipe-scoped sub against a non-existent recipe', () => {
      const seed = seedFixtures(db);
      expect(() =>
        raw
          .prepare(
            `INSERT INTO substitutions (from_ingredient_id, to_ingredient_id, scope, recipe_id)
             VALUES (?, ?, 'recipe', 9999)`
          )
          .run(seed.butterId, seed.oliveOilId)
      ).toThrow();
    });

    it('refuses to delete an ingredient that is referenced as the from side of a sub', () => {
      const seed = seedFixtures(db);
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
      });
      expect(() => raw.prepare(`DELETE FROM ingredients WHERE id=?`).run(seed.butterId)).toThrow();
    });
  });

  describe('deleteRecipe cascades recipe-scoped subs', () => {
    it('drops recipe-scoped subs but preserves global ones', () => {
      const seed = seedFixtures(db);
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
      });
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        scope: 'recipe',
        recipeId: seed.recipeId,
        ratio: 0.5,
      });
      deleteRecipe(db, seed.recipeId);
      const remaining = db.select().from(substitutions).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.scope).toBe('global');
    });

    it('deleteRecipeScopedSubstitutions only touches the named recipe', () => {
      const seed = seedFixtures(db);
      const { recipe: r2 } = createRecipe(db, {
        slug: 'pancakes',
        firstVersion: { title: 'Pancakes', bodyDsl: '@recipe(pancakes)' },
      });
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        scope: 'recipe',
        recipeId: seed.recipeId,
      });
      createSubstitution(db, {
        from: { ingredientId: seed.butterId },
        to: { ingredientId: seed.oliveOilId },
        scope: 'recipe',
        recipeId: r2.id,
      });
      deleteRecipeScopedSubstitutions(db, seed.recipeId);
      const remaining = db
        .select()
        .from(substitutions)
        .where(and(eq(substitutions.scope, 'recipe'), eq(substitutions.recipeId, r2.id)))
        .all();
      expect(remaining).toHaveLength(1);
    });
  });

  describe('service guard — endpoint shape validation', () => {
    it('rejects a from endpoint with both ingredientId and variantId set', () => {
      const seed = seedFixtures(db);
      expect(() =>
        createSubstitution(db, {
          from: { ingredientId: seed.butterId, variantId: seed.oliveOilExtraVirginId },
          to: { ingredientId: seed.oliveOilId },
        })
      ).toThrow(/exactly one/);
    });

    it('rejects an endpoint with neither side set', () => {
      const seed = seedFixtures(db);
      expect(() =>
        createSubstitution(db, {
          from: {},
          to: { ingredientId: seed.oliveOilId },
        })
      ).toThrow(/exactly one/);
    });
  });
});
