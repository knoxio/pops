/**
 * PRD-151 — integration tests for `food.ingredients.tags.*`.
 *
 * Same setup pattern as `data-routers.test.ts`: in-memory SQLite, real
 * router stack, real service layer. Covers each procedure's happy path +
 * the most likely failure modes (BadTagFormat, IngredientNotFound, empty
 * set replacement) so the wire contract is locked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestContext, type createCaller } from '../../../shared/test-utils.js';
import { foodMigrationTags } from '../migrations.js';

import type { Database } from 'better-sqlite3';

function applyFoodMigrations(db: Database): void {
  for (const tag of foodMigrationTags) {
    const sql = readFileSync(
      join(__dirname, '../../../db/drizzle-migrations', `${tag}.sql`),
      'utf8'
    );
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) db.exec(trimmed);
    }
  }
}

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
  applyFoodMigrations(db);
});

afterEach(() => {
  ctx.teardown();
});

async function createIngredient(slug: string, name: string): Promise<number> {
  const row = await caller.food.ingredients.create({ slug, name, defaultUnit: 'count' });
  if (row === undefined || row === null) throw new Error(`failed to create ${slug}`);
  return row.id;
}

describe('food.ingredients.tags', () => {
  describe('set + list round-trip', () => {
    it('replaces the tag set and re-reads sorted', async () => {
      const id = await createIngredient('tomato', 'Tomato');
      const setResult = await caller.food.ingredients.tags.set({
        ingredientId: id,
        tags: ['store-section:produce', 'diet:vegan'],
      });
      expect(setResult).toEqual({ ok: true });
      const list = await caller.food.ingredients.tags.list({ ingredientId: id });
      expect(list.tags).toEqual(['diet:vegan', 'store-section:produce']);
    });

    it('lowercases + trims at the boundary', async () => {
      const id = await createIngredient('tomato', 'Tomato');
      await caller.food.ingredients.tags.set({
        ingredientId: id,
        tags: ['  STORE-SECTION:Produce  '],
      });
      const list = await caller.food.ingredients.tags.list({ ingredientId: id });
      expect(list.tags).toEqual(['store-section:produce']);
    });

    it('empty array clears every tag', async () => {
      const id = await createIngredient('tomato', 'Tomato');
      await caller.food.ingredients.tags.set({
        ingredientId: id,
        tags: ['store-section:produce'],
      });
      await caller.food.ingredients.tags.set({ ingredientId: id, tags: [] });
      const list = await caller.food.ingredients.tags.list({ ingredientId: id });
      expect(list.tags).toEqual([]);
    });
  });

  describe('error mapping', () => {
    it('set returns BadTagFormat for invalid input — no thrown TRPCError', async () => {
      const id = await createIngredient('tomato', 'Tomato');
      const result = await caller.food.ingredients.tags.set({
        ingredientId: id,
        tags: ['store-section: with space'],
      });
      expect(result).toEqual({ ok: false, reason: 'BadTagFormat' });
    });

    it('set returns TagTooLong for > 64 chars', async () => {
      const id = await createIngredient('tomato', 'Tomato');
      const longTag = 'a'.repeat(65);
      const result = await caller.food.ingredients.tags.set({
        ingredientId: id,
        tags: [longTag],
      });
      expect(result).toEqual({ ok: false, reason: 'TagTooLong' });
    });

    it('set returns IngredientNotFound when the ingredient is missing', async () => {
      const result = await caller.food.ingredients.tags.set({
        ingredientId: 9999,
        tags: ['store-section:produce'],
      });
      expect(result).toEqual({ ok: false, reason: 'IngredientNotFound' });
    });
  });

  describe('distinct', () => {
    it('returns rows sorted by usage descending', async () => {
      const tomato = await createIngredient('tomato', 'Tomato');
      const onion = await createIngredient('onion', 'Onion');
      const garlic = await createIngredient('garlic', 'Garlic');
      await caller.food.ingredients.tags.set({
        ingredientId: tomato,
        tags: ['store-section:produce', 'diet:vegan'],
      });
      await caller.food.ingredients.tags.set({
        ingredientId: onion,
        tags: ['store-section:produce'],
      });
      await caller.food.ingredients.tags.set({
        ingredientId: garlic,
        tags: ['store-section:produce'],
      });
      const all = await caller.food.ingredients.tags.distinct({});
      expect(all.tags[0]?.tag).toBe('store-section:produce');
      expect(all.tags[0]?.ingredientCount).toBe(3);
    });

    it('filters by namespacePrefix', async () => {
      const tomato = await createIngredient('tomato', 'Tomato');
      await caller.food.ingredients.tags.set({
        ingredientId: tomato,
        tags: ['store-section:produce', 'diet:vegan'],
      });
      const sections = await caller.food.ingredients.tags.distinct({
        namespacePrefix: 'store-section',
      });
      expect(sections.tags.map((t) => t.tag)).toEqual(['store-section:produce']);
    });

    it('returns empty result when no rows match', async () => {
      const result = await caller.food.ingredients.tags.distinct({
        namespacePrefix: 'store-section',
      });
      expect(result.tags).toEqual([]);
    });
  });

  describe('findByTag', () => {
    it('returns ingredients carrying the tag, sorted by name', async () => {
      const tomato = await createIngredient('tomato', 'Tomato');
      const onion = await createIngredient('onion', 'Onion');
      await caller.food.ingredients.tags.set({
        ingredientId: tomato,
        tags: ['store-section:produce'],
      });
      await caller.food.ingredients.tags.set({
        ingredientId: onion,
        tags: ['store-section:produce'],
      });
      const result = await caller.food.ingredients.tags.findByTag({
        tag: 'store-section:produce',
      });
      expect(result.ingredients.map((i) => i.slug)).toEqual(['onion', 'tomato']);
    });

    it('returns empty result for an unknown tag', async () => {
      const result = await caller.food.ingredients.tags.findByTag({ tag: 'nope:none' });
      expect(result.ingredients).toEqual([]);
    });
  });

  describe('CASCADE on ingredient delete', () => {
    it('drops every tag row when the ingredient is deleted', async () => {
      const tomato = await createIngredient('tomato', 'Tomato');
      await caller.food.ingredients.tags.set({
        ingredientId: tomato,
        tags: ['store-section:produce', 'diet:vegan'],
      });
      const before = db
        .prepare(`SELECT COUNT(*) AS n FROM ingredient_tags WHERE ingredient_id = ?`)
        .get(tomato) as { n: number };
      expect(before.n).toBe(2);
      await caller.food.ingredients.delete({ id: tomato });
      const after = db
        .prepare(`SELECT COUNT(*) AS n FROM ingredient_tags WHERE ingredient_id = ?`)
        .get(tomato) as { n: number };
      expect(after.n).toBe(0);
    });
  });
});
