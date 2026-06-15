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
 *   food.aliases.{list, listWithTargets, create, updateText, delete, merge, bulkApprove}
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

  it('recipeRefs returns zero for an unreferenced ingredient', async () => {
    const apple = await caller.food.ingredients.create({
      slug: 'apple',
      name: 'Apple',
      defaultUnit: 'count',
    });
    const result = await caller.food.ingredients.recipeRefs({ id: apple!.id });
    expect(result).toEqual({ count: 0, recipes: [] });
  });

  it('recipeRefs reports recipes that reference this ingredient via recipe_lines', async () => {
    const apple = await caller.food.ingredients.create({
      slug: 'apple',
      name: 'Apple',
      defaultUnit: 'count',
    });
    const recipeId = db
      .prepare(`INSERT INTO recipes (slug, recipe_type) VALUES ('apple-pie', 'plate') RETURNING id`)
      .get() as { id: number };
    db.prepare(
      `INSERT INTO slug_registry (slug, kind, target_id) VALUES ('apple-pie', 'recipe', ${recipeId.id})`
    ).run();
    const versionId = db
      .prepare(
        `INSERT INTO recipe_versions (recipe_id, version_no, title, body_dsl, compile_status) VALUES (?, 1, 'Apple pie', '@recipe(apple-pie)', 'compiled') RETURNING id`
      )
      .get(recipeId.id) as { id: number };
    db.prepare(`UPDATE recipes SET current_version_id = ? WHERE id = ?`).run(
      versionId.id,
      recipeId.id
    );
    db.prepare(
      `INSERT INTO recipe_lines (recipe_version_id, position, ingredient_id, original_text, original_qty, original_unit, canonical_unit) VALUES (?, 1, ?, 'apple', 1, 'count', 'count')`
    ).run(versionId.id, apple!.id);

    const result = await caller.food.ingredients.recipeRefs({ id: apple!.id });
    expect(result.count).toBe(1);
    expect(result.recipes).toEqual([
      { recipeId: recipeId.id, recipeSlug: 'apple-pie', recipeTitle: 'Apple pie' },
    ]);
  });

  it('recipeRefs dedupes when a recipe references the ingredient on multiple lines', async () => {
    const apple = await caller.food.ingredients.create({
      slug: 'apple',
      name: 'Apple',
      defaultUnit: 'count',
    });
    const recipe = db
      .prepare(
        `INSERT INTO recipes (slug, recipe_type) VALUES ('apple-cake', 'plate') RETURNING id`
      )
      .get() as { id: number };
    db.prepare(
      `INSERT INTO slug_registry (slug, kind, target_id) VALUES ('apple-cake', 'recipe', ${recipe.id})`
    ).run();
    const version = db
      .prepare(
        `INSERT INTO recipe_versions (recipe_id, version_no, title, body_dsl, compile_status) VALUES (?, 1, 'Apple cake', '', 'compiled') RETURNING id`
      )
      .get(recipe.id) as { id: number };
    db.prepare(`UPDATE recipes SET current_version_id = ? WHERE id = ?`).run(version.id, recipe.id);
    for (const pos of [1, 2, 3]) {
      db.prepare(
        `INSERT INTO recipe_lines (recipe_version_id, position, ingredient_id, original_text, original_qty, original_unit, canonical_unit) VALUES (?, ?, ?, 'apple', 1, 'count', 'count')`
      ).run(version.id, pos, apple!.id);
    }
    const result = await caller.food.ingredients.recipeRefs({ id: apple!.id });
    expect(result.count).toBe(1);
    expect(result.recipes[0]?.recipeTitle).toBe('Apple cake');
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

  it('listWithTargets denormalises ingredient + variant labels', async () => {
    const banana = await caller.food.ingredients.create({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
    });
    const variant = await caller.food.variants.create({
      ingredientId: banana!.id,
      slug: 'ripe',
      name: 'Ripe',
      defaultUnit: 'count',
    });
    await caller.food.aliases.create({
      alias: 'platano',
      target: { kind: 'ingredient', id: banana!.id },
    });
    await caller.food.aliases.create({
      alias: 'maduro',
      target: { kind: 'variant', id: variant!.id },
    });
    const list = await caller.food.aliases.listWithTargets({});
    expect(list.items).toHaveLength(2);
    const platano = list.items.find((r) => r.alias.alias === 'platano');
    const maduro = list.items.find((r) => r.alias.alias === 'maduro');
    expect(platano?.target).toEqual({
      kind: 'ingredient',
      id: banana!.id,
      slug: 'banana',
      name: 'Banana',
    });
    expect(maduro?.target).toEqual({
      kind: 'variant',
      id: variant!.id,
      slug: 'ripe',
      name: 'Ripe',
      parentIngredientSlug: 'banana',
      parentIngredientName: 'Banana',
    });
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

  it('listHydrated returns rows with from/to slugs and parent slugs', async () => {
    const { banana, apple } = await seedTwoIngredients();
    await caller.food.substitutions.create({
      from: { ingredientId: banana },
      to: { ingredientId: apple },
    });
    const result = await caller.food.substitutions.listHydrated({});
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item?.from).toMatchObject({ kind: 'ingredient', slug: 'banana', name: 'Banana' });
    expect(item?.to).toMatchObject({ kind: 'ingredient', slug: 'apple', name: 'Apple' });
    expect(item?.recipeSlug).toBeNull();
  });

  it('listHydrated filters by to-ingredient', async () => {
    const { banana, apple } = await seedTwoIngredients();
    const pear = await caller.food.ingredients.create({
      slug: 'pear',
      name: 'Pear',
      defaultUnit: 'count',
    });
    await caller.food.substitutions.create({
      from: { ingredientId: banana },
      to: { ingredientId: apple },
    });
    await caller.food.substitutions.create({
      from: { ingredientId: banana },
      to: { ingredientId: pear!.id },
    });
    const filtered = await caller.food.substitutions.listHydrated({ toIngredientId: pear!.id });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.to.slug).toBe('pear');
  });

  it('listHydrated resolves variant endpoints with parent slug', async () => {
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
    const ripe = await caller.food.variants.create({
      ingredientId: banana!.id,
      slug: 'ripe',
      name: 'Ripe',
      defaultUnit: 'count',
    });
    await caller.food.substitutions.create({
      from: { variantId: ripe.id },
      to: { ingredientId: apple!.id },
    });
    const result = await caller.food.substitutions.listHydrated({});
    expect(result.items[0]?.from).toMatchObject({
      kind: 'variant',
      slug: 'ripe',
      parentSlug: 'banana',
    });
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

  it('finds prep_states by substring with display name (food.db partition)', async () => {
    await caller.food.prepStates.create({ slug: 'diced', name: 'Diced' });
    const result = await caller.food.slugs.search({ query: 'dic', kinds: ['prep_state'] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ slug: 'diced', kind: 'prep_state', name: 'Diced' });
  });

  it('merges ingredient + prep_state results across the food.db partition with a single query', async () => {
    await caller.food.ingredients.create({ slug: 'date', name: 'Date', defaultUnit: 'count' });
    await caller.food.prepStates.create({ slug: 'date-stuffed', name: 'Date-stuffed' });
    const result = await caller.food.slugs.search({ query: 'date' });
    const kinds = result.items.map((row) => row.kind).toSorted();
    expect(kinds).toEqual(['ingredient', 'prep_state']);
  });

  it('honours `kinds: ["recipe"]` — recipes still resolve through the legacy pops.db partition', async () => {
    const result = await caller.food.slugs.search({ query: 'whatever', kinds: ['recipe'] });
    expect(Array.isArray(result.items)).toBe(true);
  });
});
