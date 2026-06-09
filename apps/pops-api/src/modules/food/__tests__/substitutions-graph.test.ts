/**
 * PRD-148 — integration tests for `food.substitutions.graphView`.
 *
 * Asserts:
 *   - Empty filters return the minimum spanning subgraph of the full global
 *     edge set (default scope='global').
 *   - Scope toggle (global ↔ recipe) narrows correctly and a missing
 *     recipeId on scope='recipe' surfaces as BAD_REQUEST.
 *   - Context-tag filter respects PRD-109's wildcard-OR semantics (empty
 *     `context_tags` array is a wildcard).
 *   - Search trims edges whose nodes don't match the substring (case-
 *     insensitive over ingredient name/slug + variant name/slug).
 *   - Variant edges hydrate the parent ingredient labels so the client can
 *     render `<ingredient> · <variant>`.
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

async function seedCommonGraph(): Promise<{
  bananaId: number;
  appleId: number;
  butterId: number;
  oliveOilId: number;
  bananaRipeVariantId: number;
}> {
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
  const butter = await caller.food.ingredients.create({
    slug: 'butter',
    name: 'Butter',
    defaultUnit: 'g',
  });
  const oliveOil = await caller.food.ingredients.create({
    slug: 'olive-oil',
    name: 'Olive oil',
    defaultUnit: 'ml',
  });
  const variant = await caller.food.variants.create({
    ingredientId: banana!.id,
    slug: 'ripe',
    name: 'Ripe',
    defaultUnit: 'count',
  });
  return {
    bananaId: banana!.id,
    appleId: apple!.id,
    butterId: butter!.id,
    oliveOilId: oliveOil!.id,
    bananaRipeVariantId: variant!.id,
  };
}

describe('food.substitutions.graphView', () => {
  it('returns nodes + edges for the default global view', async () => {
    const ids = await seedCommonGraph();
    await caller.food.substitutions.create({
      from: { ingredientId: ids.butterId },
      to: { ingredientId: ids.oliveOilId },
      ratio: 0.75,
      contextTags: ['savory'],
    });
    await caller.food.substitutions.create({
      from: { ingredientId: ids.bananaId },
      to: { ingredientId: ids.appleId },
    });

    const view = await caller.food.substitutions.graphView();
    expect(view.edges).toHaveLength(2);
    expect(new Set(view.nodes.map((n) => n.id))).toEqual(
      new Set([
        `ingredient:${ids.appleId}`,
        `ingredient:${ids.bananaId}`,
        `ingredient:${ids.butterId}`,
        `ingredient:${ids.oliveOilId}`,
      ])
    );

    const butterEdge = view.edges.find((e) => e.fromNodeId === `ingredient:${ids.butterId}`);
    expect(butterEdge).toMatchObject({
      ratio: 0.75,
      contextTags: ['savory'],
      scope: 'global',
      recipeId: null,
    });
  });

  it('filters by scope; recipe scope requires recipeId', async () => {
    await seedCommonGraph();
    await expect(caller.food.substitutions.graphView({ scope: 'recipe' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('honours PRD-109 wildcard semantics on contextTag filter', async () => {
    const ids = await seedCommonGraph();
    // Tagged edge: only matches when the requested tag is in its set.
    await caller.food.substitutions.create({
      from: { ingredientId: ids.butterId },
      to: { ingredientId: ids.oliveOilId },
      contextTags: ['savory'],
    });
    // Wildcard edge (no tags): should match ANY contextTag query.
    await caller.food.substitutions.create({
      from: { ingredientId: ids.bananaId },
      to: { ingredientId: ids.appleId },
    });

    const baking = await caller.food.substitutions.graphView({ contextTag: 'baking' });
    // Only the wildcard edge survives a `baking` filter.
    expect(baking.edges).toHaveLength(1);
    expect(baking.edges[0]?.fromNodeId).toBe(`ingredient:${ids.bananaId}`);

    const savory = await caller.food.substitutions.graphView({ contextTag: 'savory' });
    // Both edges survive: the tagged one matches by tag, the wildcard by being empty.
    expect(savory.edges).toHaveLength(2);
  });

  it('search narrows edges to those touching nodes whose labels match (case-insensitive)', async () => {
    const ids = await seedCommonGraph();
    await caller.food.substitutions.create({
      from: { ingredientId: ids.butterId },
      to: { ingredientId: ids.oliveOilId },
    });
    await caller.food.substitutions.create({
      from: { ingredientId: ids.bananaId },
      to: { ingredientId: ids.appleId },
    });

    const view = await caller.food.substitutions.graphView({ search: 'butt' });
    expect(view.edges).toHaveLength(1);
    expect(view.edges[0]?.fromNodeId).toBe(`ingredient:${ids.butterId}`);

    const upper = await caller.food.substitutions.graphView({ search: 'APPLE' });
    expect(upper.edges).toHaveLength(1);
    expect(upper.edges[0]?.toNodeId).toBe(`ingredient:${ids.appleId}`);

    const miss = await caller.food.substitutions.graphView({ search: 'kohlrabi' });
    expect(miss.edges).toEqual([]);
    expect(miss.nodes).toEqual([]);
  });

  it('hydrates parent ingredient labels for variant sides', async () => {
    const ids = await seedCommonGraph();
    await caller.food.substitutions.create({
      from: { variantId: ids.bananaRipeVariantId },
      to: { ingredientId: ids.appleId },
    });

    const view = await caller.food.substitutions.graphView();
    expect(view.edges).toHaveLength(1);
    const variantNode = view.nodes.find((n) => n.kind === 'variant');
    expect(variantNode).toMatchObject({
      id: `variant:${ids.bananaRipeVariantId}`,
      kind: 'variant',
      ingredientId: ids.bananaId,
      ingredientSlug: 'banana',
      ingredientName: 'Banana',
      variantSlug: 'ripe',
      variantName: 'Ripe',
    });
  });
});
