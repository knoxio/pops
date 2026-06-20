/**
 * PRD-122 — service-layer additions powering the data management page.
 *
 * Covers the new services that the UI tabs will consume:
 *   - aliases:                createAlias, updateAliasText, deleteAlias,
 *                             listAliases (search/source/target filters),
 *                             mergeAliases, bulkApproveAliases
 *   - ingredients-queries:    listIngredients, getIngredient(BySlug),
 *                             listVariantsForIngredient,
 *                             getIngredientDeleteBlockers
 *   - substitutions:          listSubstitutions (filters, json_each tag),
 *                             updateSubstitution (ratio + tag round-trip)
 *   - prep-states:            listPrepStates
 *   - slug-search:            searchSlugs across kinds with name resolution
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../open-food-db.js';
import { ingredientAliases } from '../schema.js';
import {
  bulkApproveAliases,
  createAlias,
  deleteAlias,
  listAliases,
  mergeAliases,
  updateAliasText,
} from '../services/aliases.js';
import {
  getIngredient,
  getIngredientBySlug,
  getIngredientDeleteBlockers,
  listIngredients,
  listVariantsForIngredient,
} from '../services/ingredients-queries.js';
import { createIngredient, type FoodDb } from '../services/ingredients.js';
import { createPrepState, listPrepStates } from '../services/prep-states.js';
import { createRecipe } from '../services/recipes.js';
import { searchSlugs } from '../services/slug-search.js';
import { listSubstitutions, updateSubstitution } from '../services/substitutions-queries.js';
import { createSubstitution } from '../services/substitutions.js';
import { createVariant } from '../services/variants.js';

import type Database from 'better-sqlite3';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

interface Seed {
  bananaId: number;
  appleId: number;
  bananaRawVariantId: number;
  appleRawVariantId: number;
  cookiesRecipeId: number;
  saltSlugId: number; // prep_state
}

function seedFixtures(db: FoodDb): Seed {
  const banana = createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
  const apple = createIngredient(db, { name: 'Apple', slug: 'apple', defaultUnit: 'count' });
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
  const salt = createPrepState(db, { name: 'Salted', slug: 'salted' });
  const { recipe } = createRecipe(db, {
    slug: 'cookies',
    firstVersion: { title: 'Cookies', bodyDsl: '@recipe(cookies)' },
  });
  return {
    bananaId: banana.id,
    appleId: apple.id,
    bananaRawVariantId: bananaRaw.id,
    appleRawVariantId: appleRaw.id,
    cookiesRecipeId: recipe.id,
    saltSlugId: salt.id,
  };
}

describe('PRD-122 — data-page services', () => {
  let db: FoodDb;
  let raw: Database.Database;
  let seed: Seed;

  beforeEach(() => {
    ({ db, raw } = freshDb());
    seed = seedFixtures(db);
  });

  describe('aliases', () => {
    it('createAlias rejects a row that points at both ingredient and variant (XOR CHECK)', () => {
      createAlias(db, {
        alias: 'platano',
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      expect(() =>
        raw
          .prepare(
            `INSERT INTO ingredient_aliases (ingredient_id, variant_id, alias, source) VALUES (?, ?, ?, 'user')`
          )
          .run(seed.bananaId, seed.bananaRawVariantId, 'both')
      ).toThrow();
    });

    it('updateAliasText round-trips the new text', () => {
      const created = createAlias(db, {
        alias: 'platano',
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      const updated = updateAliasText(db, created.id, 'plátano');
      expect(updated.alias).toBe('plátano');
    });

    it('listAliases filters by source', () => {
      createAlias(db, {
        alias: 'platano',
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      createAlias(db, {
        alias: 'banana-from-llm',
        target: { kind: 'ingredient', id: seed.bananaId },
        source: 'llm',
      });
      const llmOnly = listAliases(db, { source: 'llm' });
      expect(llmOnly).toHaveLength(1);
      expect(llmOnly[0]?.source).toBe('llm');
    });

    it('listAliases filters by target', () => {
      createAlias(db, {
        alias: 'platano',
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      createAlias(db, {
        alias: 'manzana',
        target: { kind: 'ingredient', id: seed.appleId },
      });
      const bananas = listAliases(db, {
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      expect(bananas).toHaveLength(1);
      expect(bananas[0]?.alias).toBe('platano');
    });

    it('mergeAliases re-points multiple aliases to a single canonical ingredient', () => {
      const llmA = createAlias(db, {
        alias: 'bnana',
        target: { kind: 'ingredient', id: seed.appleId },
        source: 'llm',
      });
      const llmB = createAlias(db, {
        alias: 'banaaana',
        target: { kind: 'ingredient', id: seed.appleId },
        source: 'llm',
      });
      const result = mergeAliases(db, {
        aliasIds: [llmA.id, llmB.id],
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      expect(result.mergedCount).toBe(2);
      const bananaAliases = listAliases(db, {
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      expect(bananaAliases.map((a) => a.alias).toSorted()).toEqual(['banaaana', 'bnana']);
    });

    it('mergeAliases is a no-op for aliases already at the canonical target', () => {
      const existing = createAlias(db, {
        alias: 'platano',
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      const result = mergeAliases(db, {
        aliasIds: [existing.id],
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      expect(result.mergedCount).toBe(0);
      const rows = db.select().from(ingredientAliases).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(existing.id);
    });

    it('mergeAliases collapses duplicate alias text at the canonical target without aborting', () => {
      // 'fruta' is already on banana. The merge of an apple-side 'fruta'
      // would collide with banana's row via the partial UNIQUE; ON CONFLICT
      // DO NOTHING lets the merge complete by silently dropping the dup.
      createAlias(db, {
        alias: 'fruta',
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      const conflicting = createAlias(db, {
        alias: 'fruta',
        target: { kind: 'ingredient', id: seed.appleId },
        source: 'llm',
      });
      const unique = createAlias(db, {
        alias: 'manzana',
        target: { kind: 'ingredient', id: seed.appleId },
        source: 'llm',
      });
      const result = mergeAliases(db, {
        aliasIds: [conflicting.id, unique.id],
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      expect(result.mergedCount).toBe(2);
      const bananaAliases = listAliases(db, {
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      expect(bananaAliases.map((a) => a.alias).toSorted()).toEqual(['fruta', 'manzana']);
      // The colliding apple row was deleted as part of the merge.
      const appleAliases = listAliases(db, {
        target: { kind: 'ingredient', id: seed.appleId },
      });
      expect(appleAliases).toHaveLength(0);
    });

    it('bulkApproveAliases flips llm rows to user and skips already-user rows', () => {
      const a = createAlias(db, {
        alias: 'a',
        target: { kind: 'ingredient', id: seed.bananaId },
        source: 'llm',
      });
      const b = createAlias(db, {
        alias: 'b',
        target: { kind: 'ingredient', id: seed.bananaId },
        source: 'user',
      });
      const result = bulkApproveAliases(db, [a.id, b.id]);
      expect(result.updatedCount).toBe(1);
      const approved = listAliases(db, { source: 'user' });
      expect(approved.map((r) => r.alias).toSorted()).toEqual(['a', 'b']);
    });

    it('deleteAlias removes the row by id', () => {
      const a = createAlias(db, {
        alias: 'platano',
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      deleteAlias(db, a.id);
      expect(listAliases(db)).toHaveLength(0);
    });
  });

  describe('ingredients-queries', () => {
    it('listIngredients returns all rows by default', () => {
      const rows = listIngredients(db);
      const slugs = rows.map((r) => r.slug).toSorted();
      expect(slugs).toEqual(['apple', 'banana']);
    });

    it('listIngredients filters by case-insensitive search across name + slug', () => {
      const rows = listIngredients(db, { search: 'banan' });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.slug).toBe('banana');
    });

    it('listIngredients filters to roots when parentId is null', () => {
      const child = createIngredient(db, {
        name: 'Kid Banana',
        slug: 'kid-banana',
        defaultUnit: 'count',
        parentId: seed.bananaId,
      });
      const roots = listIngredients(db, { parentId: null });
      expect(roots.map((r) => r.id).toSorted()).toEqual([seed.bananaId, seed.appleId].toSorted());
      const children = listIngredients(db, { parentId: seed.bananaId });
      expect(children).toHaveLength(1);
      expect(children[0]?.id).toBe(child.id);
    });

    it('getIngredient + getIngredientBySlug both find existing rows', () => {
      expect(getIngredient(db, seed.bananaId)?.slug).toBe('banana');
      expect(getIngredientBySlug(db, 'banana')?.id).toBe(seed.bananaId);
    });

    it('getIngredient returns null for an unknown id', () => {
      expect(getIngredient(db, 9999)).toBeNull();
      expect(getIngredientBySlug(db, 'mystery')).toBeNull();
    });

    it('listVariantsForIngredient scopes to one parent', () => {
      const bananaVariants = listVariantsForIngredient(db, seed.bananaId);
      expect(bananaVariants.map((v) => v.slug)).toEqual(['raw']);
      expect(bananaVariants.every((v) => v.ingredientId === seed.bananaId)).toBe(true);
    });

    it('getIngredientDeleteBlockers counts variants + aliases referencing the row', () => {
      createAlias(db, {
        alias: 'platano',
        target: { kind: 'ingredient', id: seed.bananaId },
      });
      const blockers = getIngredientDeleteBlockers(db, seed.bananaId);
      expect(blockers.variants).toBe(1);
      expect(blockers.aliases).toBe(1);
      // Apple has only a variant.
      expect(getIngredientDeleteBlockers(db, seed.appleId)).toEqual({
        variants: 1,
        aliases: 0,
      });
    });
  });

  describe('substitutions list + update', () => {
    it('listSubstitutions filters by from-ingredient', () => {
      createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { ingredientId: seed.appleId },
      });
      createSubstitution(db, {
        from: { ingredientId: seed.appleId },
        to: { ingredientId: seed.bananaId },
      });
      const fromBanana = listSubstitutions(db, { fromIngredientId: seed.bananaId });
      expect(fromBanana).toHaveLength(1);
      expect(fromBanana[0]?.toIngredientId).toBe(seed.appleId);
    });

    it('listSubstitutions filters by scope=recipe + recipeId', () => {
      createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { ingredientId: seed.appleId },
      });
      createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { ingredientId: seed.appleId },
        scope: 'recipe',
        recipeId: seed.cookiesRecipeId,
        ratio: 0.5,
      });
      const scoped = listSubstitutions(db, {
        scope: 'recipe',
        recipeId: seed.cookiesRecipeId,
      });
      expect(scoped).toHaveLength(1);
      expect(scoped[0]?.ratio).toBe(0.5);
    });

    it('listSubstitutions filters by contextTag via json_each', () => {
      createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { ingredientId: seed.appleId },
        contextTags: ['baking', 'sweet'],
      });
      createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { variantId: seed.appleRawVariantId },
        contextTags: ['savory'],
      });
      const baking = listSubstitutions(db, { contextTag: 'baking' });
      expect(baking).toHaveLength(1);
      expect(baking[0]?.contextTags).toEqual(['baking', 'sweet']);
    });

    it('listSubstitutions includes wildcard edges (empty context_tags) when filtering by a tag', () => {
      // PRD-109 amendment: empty context_tags = "applies in any context".
      // Tag-filtered queries must surface wildcards alongside specific matches.
      createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { ingredientId: seed.appleId },
        contextTags: [],
      });
      createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { variantId: seed.appleRawVariantId },
        contextTags: ['savory'],
      });
      const baking = listSubstitutions(db, { contextTag: 'baking' });
      expect(baking).toHaveLength(1);
      expect(baking[0]?.contextTags).toEqual([]);
    });

    it('updateSubstitution patches ratio and contextTags', () => {
      const sub = createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { ingredientId: seed.appleId },
        ratio: 1,
        contextTags: ['baking'],
      });
      const updated = updateSubstitution(db, sub.id, {
        ratio: 0.75,
        contextTags: ['baking', 'sweet'],
      });
      expect(updated.ratio).toBe(0.75);
      expect(updated.contextTags).toEqual(['baking', 'sweet']);
    });

    it('updateSubstitution rejects an empty patch', () => {
      const sub = createSubstitution(db, {
        from: { ingredientId: seed.bananaId },
        to: { ingredientId: seed.appleId },
      });
      expect(() => updateSubstitution(db, sub.id, {})).toThrow(/at least one field/);
    });
  });

  describe('prep-states list', () => {
    it('returns every seeded prep state', () => {
      createPrepState(db, { name: 'Diced', slug: 'diced' });
      const rows = listPrepStates(db);
      expect(rows.map((r) => r.slug).toSorted()).toEqual(['diced', 'salted']);
    });
  });

  describe('slug-search', () => {
    it('returns empty for an empty query', () => {
      expect(searchSlugs(db, { query: '' })).toEqual([]);
    });

    it('matches across ingredient + recipe + prep_state kinds', () => {
      const matches = searchSlugs(db, { query: 'a' });
      const slugs = matches.map((m) => m.slug).toSorted();
      // banana, apple, salted, cookies all contain an 'a' / 'oo' / etc.
      expect(slugs).toContain('banana');
      expect(slugs).toContain('apple');
      expect(slugs).toContain('salted');
    });

    it('filters by kind subset', () => {
      const recipesOnly = searchSlugs(db, { query: 'cookies', kinds: ['recipe'] });
      expect(recipesOnly).toHaveLength(1);
      expect(recipesOnly[0]?.kind).toBe('recipe');
      const ingredientsOnly = searchSlugs(db, { query: 'cookies', kinds: ['ingredient'] });
      expect(ingredientsOnly).toHaveLength(0);
    });

    it('returns the ingredient display name in the match shape', () => {
      const matches = searchSlugs(db, { query: 'banana', kinds: ['ingredient'] });
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        slug: 'banana',
        kind: 'ingredient',
        targetId: seed.bananaId,
        name: 'Banana',
      });
    });

    it('honours the limit parameter', () => {
      const matches = searchSlugs(db, { query: 'a', limit: 1 });
      expect(matches).toHaveLength(1);
    });
  });
});
