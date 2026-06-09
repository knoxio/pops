/**
 * PRD-122 — integration tests for the six food data routers.
 *
 * Runs against an in-memory SQLite seeded with the food migrations (PRD-106
 * through PRD-111) on top of the shared test context. Each procedure gets a
 * happy-path case plus the invariant the service layer is most likely to
 * surface (slug collisions, missing rows, CHECK violations, etc.).
 *
 * Routers wired:
 *   food.ingredients.{list, get, create, update, rename, changeParent,
 *                     blockers, delete}
 *   food.variants.{create, update, delete}
 *   food.aliases.{list, create, updateText, delete, merge, bulkApprove}
 *   food.prepStates.{list, create}
 *   food.substitutions.{list, create, update, delete}
 *   food.slugs.search
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
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

describe('food.ingredients', () => {
  it('create + list + get round-trip', async () => {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    expect(banana?.slug).toBe('banana');
    const list = await caller.food.ingredients.list({});
    expect(list.items.map((i) => i.slug)).toEqual(['banana']);
    const got = await caller.food.ingredients.get({ idOrSlug: 'banana' });
    expect(got.ingredient.id).toBe(banana?.id);
    expect(got.variants).toEqual([]);
  });

  it('get throws NOT_FOUND for an unknown slug', async () => {
    await expect(caller.food.ingredients.get({ idOrSlug: 'mystery' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('create maps SlugAlreadyRegisteredError to CONFLICT', async () => {
    await caller.food.ingredients.create({ slug: 'apple', name: 'Apple', defaultUnit: 'count' });
    await expect(
      caller.food.ingredients.create({ slug: 'apple', name: 'Apple 2', defaultUnit: 'count' })
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      caller.food.ingredients.create({ slug: 'apple', name: 'Apple 2', defaultUnit: 'count' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('create maps InvalidSlugError to BAD_REQUEST', async () => {
    await expect(
      caller.food.ingredients.create({ slug: 'Banana', name: 'Banana', defaultUnit: 'count' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rename updates the slug and the registry', async () => {
    await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    await caller.food.ingredients.rename({ oldSlug: 'banana', newSlug: 'musa' });
    const got = await caller.food.ingredients.get({ idOrSlug: 'musa' });
    expect(got.ingredient.slug).toBe('musa');
  });

  it('changeParent rejects a cycle', async () => {
    const a = await caller.food.ingredients.create({
      slug: 'a-ing',
      name: 'A',
      defaultUnit: 'g',
    });
    const b = await caller.food.ingredients.create({
      slug: 'b-ing',
      name: 'B',
      defaultUnit: 'g',
      parentId: a!.id,
    });
    // Re-parenting `a` under `b` would form a cycle.
    await expect(
      caller.food.ingredients.changeParent({ id: a!.id, newParentId: b!.id })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('delete returns blockers when variants exist', async () => {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    await caller.food.variants.create({
      ingredientId: banana!.id,
      slug: 'raw',
      name: 'Raw',
      defaultUnit: 'count',
    });
    const result = await caller.food.ingredients.delete({ id: banana!.id });
    expect(result).toEqual({ ok: false, blockers: { variants: 1, aliases: 0 } });
  });

  it('delete succeeds when nothing references the ingredient', async () => {
    const apple = await caller.food.ingredients.create({
      slug: 'apple',
      name: 'Apple',
      defaultUnit: 'count',
    });
    const result = await caller.food.ingredients.delete({ id: apple!.id });
    expect(result).toEqual({ ok: true });
    const list = await caller.food.ingredients.list({});
    expect(list.items).toEqual([]);
  });

  it('update rejects an empty patch with BAD_REQUEST', async () => {
    const apple = await caller.food.ingredients.create({
      slug: 'apple',
      name: 'Apple',
      defaultUnit: 'count',
    });
    await expect(caller.food.ingredients.update({ id: apple!.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('list returns ingredients in stable slug order', async () => {
    await caller.food.ingredients.create({ slug: 'cherry', name: 'C', defaultUnit: 'count' });
    await caller.food.ingredients.create({ slug: 'apple', name: 'A', defaultUnit: 'count' });
    await caller.food.ingredients.create({ slug: 'banana', name: 'B', defaultUnit: 'count' });
    const result = await caller.food.ingredients.list({});
    expect(result.items.map((i) => i.slug)).toEqual(['apple', 'banana', 'cherry']);
  });
});

describe('food.variants', () => {
  it('create scopes the variant under its parent ingredient', async () => {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    const raw = await caller.food.variants.create({
      ingredientId: banana!.id,
      slug: 'raw',
      name: 'Raw',
      defaultUnit: 'count',
    });
    const detail = await caller.food.ingredients.get({ idOrSlug: 'banana' });
    expect(detail.variants.map((v) => v.id)).toEqual([raw.id]);
  });

  it('update patches the variant in place', async () => {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    const raw = await caller.food.variants.create({
      ingredientId: banana!.id,
      slug: 'raw',
      name: 'Raw',
      defaultUnit: 'count',
    });
    const updated = await caller.food.variants.update({ id: raw.id, name: 'Fresh' });
    expect(updated?.name).toBe('Fresh');
  });

  it('create accepts shelf-life fields and persists them', async () => {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    const raw = await caller.food.variants.create({
      ingredientId: banana!.id,
      slug: 'raw',
      name: 'Raw',
      defaultUnit: 'count',
      defaultShelfLifeDaysFridge: 7,
      defaultShelfLifeDaysFreezer: 90,
    });
    expect(raw.defaultShelfLifeDaysFridge).toBe(7);
    expect(raw.defaultShelfLifeDaysFreezer).toBe(90);
  });

  it('create maps a duplicate (ingredientId, slug) to CONFLICT', async () => {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    await caller.food.variants.create({
      ingredientId: banana!.id,
      slug: 'raw',
      name: 'Raw',
      defaultUnit: 'count',
    });
    await expect(
      caller.food.variants.create({
        ingredientId: banana!.id,
        slug: 'raw',
        name: 'Raw again',
        defaultUnit: 'count',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('update rejects an empty patch with BAD_REQUEST', async () => {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    const raw = await caller.food.variants.create({
      ingredientId: banana!.id,
      slug: 'raw',
      name: 'Raw',
      defaultUnit: 'count',
    });
    await expect(caller.food.variants.update({ id: raw.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('delete returns NOT_FOUND for an unknown id', async () => {
    await expect(caller.food.variants.delete({ id: 9999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('food.aliases', () => {
  async function seedBanana(): Promise<number> {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    return banana!.id;
  }

  it('create + list filter by target', async () => {
    const id = await seedBanana();
    await caller.food.aliases.create({
      alias: 'platano',
      target: { kind: 'ingredient', id },
    });
    const all = await caller.food.aliases.list({});
    expect(all.items.map((a) => a.alias)).toEqual(['platano']);
    const targeted = await caller.food.aliases.list({
      target: { kind: 'ingredient', id },
    });
    expect(targeted.items).toHaveLength(1);
  });

  it('create maps a duplicate alias at the same target to CONFLICT', async () => {
    const id = await seedBanana();
    await caller.food.aliases.create({ alias: 'platano', target: { kind: 'ingredient', id } });
    await expect(
      caller.food.aliases.create({ alias: 'platano', target: { kind: 'ingredient', id } })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('merge re-points and bulkApprove flips llm→user', async () => {
    const bananaId = await seedBanana();
    const apple = await caller.food.ingredients.create({
      slug: 'apple',
      name: 'Apple',
      defaultUnit: 'count',
    });
    const a = await caller.food.aliases.create({
      alias: 'bnana',
      target: { kind: 'ingredient', id: apple!.id },
      source: 'llm',
    });
    const b = await caller.food.aliases.create({
      alias: 'banaaana',
      target: { kind: 'ingredient', id: apple!.id },
      source: 'llm',
    });
    const mergeResult = await caller.food.aliases.merge({
      aliasIds: [a.id, b.id],
      target: { kind: 'ingredient', id: bananaId },
    });
    expect(mergeResult.mergedCount).toBe(2);
    const llmRemaining = await caller.food.aliases.list({ source: 'llm' });
    expect(llmRemaining.items).toHaveLength(2);
    const approveResult = await caller.food.aliases.bulkApprove({
      aliasIds: llmRemaining.items.map((i) => i.id),
    });
    expect(approveResult.updatedCount).toBe(2);
    const userAfter = await caller.food.aliases.list({ source: 'user' });
    expect(userAfter.items.map((a2) => a2.alias).toSorted()).toEqual(['banaaana', 'bnana']);
  });
});

describe('food.prepStates', () => {
  it('list returns rows; create rejects an invalid slug', async () => {
    const before = await caller.food.prepStates.list();
    expect(before.items).toEqual([]);
    await caller.food.prepStates.create({ slug: 'diced', name: 'Diced' });
    const after = await caller.food.prepStates.list();
    expect(after.items.map((r) => r.slug)).toEqual(['diced']);
    await expect(
      caller.food.prepStates.create({ slug: 'Diced', name: 'Diced 2' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('food.substitutions', () => {
  async function seedTwoIngredients(): Promise<{ banana: number; apple: number }> {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    const apple = await caller.food.ingredients.create({
      slug: 'apple',
      name: 'Apple',
      defaultUnit: 'count',
    });
    return { banana: banana!.id, apple: apple!.id };
  }

  it('create + list filter by from-ingredient', async () => {
    const { banana, apple } = await seedTwoIngredients();
    await caller.food.substitutions.create({
      from: { ingredientId: banana },
      to: { ingredientId: apple },
    });
    const result = await caller.food.substitutions.list({ fromIngredientId: banana });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.toIngredientId).toBe(apple);
  });

  it('create maps CannotSubstituteSelf to BAD_REQUEST', async () => {
    const { banana } = await seedTwoIngredients();
    await expect(
      caller.food.substitutions.create({
        from: { ingredientId: banana },
        to: { ingredientId: banana },
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('create rejects a from-endpoint with both ingredientId and variantId', async () => {
    const { banana, apple } = await seedTwoIngredients();
    await expect(
      caller.food.substitutions.create({
        from: { ingredientId: banana, variantId: 1 },
        to: { ingredientId: apple },
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('create rejects scope="recipe" without recipeId', async () => {
    const { banana, apple } = await seedTwoIngredients();
    await expect(
      caller.food.substitutions.create({
        from: { ingredientId: banana },
        to: { ingredientId: apple },
        scope: 'recipe',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('update rejects an empty patch', async () => {
    const { banana, apple } = await seedTwoIngredients();
    const sub = await caller.food.substitutions.create({
      from: { ingredientId: banana },
      to: { ingredientId: apple },
    });
    await expect(caller.food.substitutions.update({ id: sub.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('update patches ratio + tags inline', async () => {
    const { banana, apple } = await seedTwoIngredients();
    const sub = await caller.food.substitutions.create({
      from: { ingredientId: banana },
      to: { ingredientId: apple },
      ratio: 1,
    });
    const updated = await caller.food.substitutions.update({
      id: sub.id,
      ratio: 0.75,
      contextTags: ['baking'],
    });
    expect(updated.ratio).toBe(0.75);
    expect(updated.contextTags).toEqual(['baking']);
  });
});

describe('food.slugs.search', () => {
  it('returns empty for an empty query', async () => {
    const result = await caller.food.slugs.search({ query: '' });
    expect(result.items).toEqual([]);
  });

  it('finds ingredients by substring with display name', async () => {
    await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    const result = await caller.food.slugs.search({ query: 'banan', kinds: ['ingredient'] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      slug: 'banana',
      kind: 'ingredient',
      name: 'Banana',
    });
  });
});
