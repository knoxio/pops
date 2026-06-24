/**
 * Resolver invariant tests (spec: pillars/food/docs/prds/dsl-resolver).
 *
 * Drives `resolveRecipeAst` against an in-memory SQLite seeded by the
 * food schema migrations. Covers each ResolveErrorCode plus the happy
 * path, mixed-error path, self-reference, recipe-as-ingredient, variant
 * scoping, and the `_` skip segment.
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../../db/open-food-db.js';
import { recipeVersions } from '../../db/schema.js';
import * as ingredientsService from '../../db/services/ingredients.js';
import { type FoodDb } from '../../db/services/internal.js';
import * as prepStatesService from '../../db/services/prep-states.js';
import * as recipeVersionsService from '../../db/services/recipe-versions.js';
import * as recipesService from '../../db/services/recipes.js';
import * as variantsService from '../../db/services/variants.js';
import { parseRecipeDsl } from '../parser.js';
import { resolveRecipeAst } from '../resolver.js';

const { createIngredient } = ingredientsService;
const { createPrepState } = prepStatesService;
const { promoteVersion } = recipeVersionsService;
const { createRecipe } = recipesService;
const { createVariant } = variantsService;
import type {
  ResolveErrorCode,
  ResolveResult,
  ResolvedIngredientBlock,
  ResolvedStepBlock,
} from '../resolver-types.js';

function freshDb(): FoodDb {
  return openFoodDb(':memory:').db;
}

function parse(input: string) {
  const r = parseRecipeDsl(input);
  if (!r.ok) {
    throw new Error(`parse failed: ${r.errors.map((e) => e.code).join(', ')}`);
  }
  return r.ast;
}

function errorCodes(result: ResolveResult): ResolveErrorCode[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('resolver: happy path', () => {
  let db: FoodDb;
  beforeEach(() => {
    db = freshDb();
    const banana = createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
    const apple = createIngredient(db, { name: 'Apple', slug: 'apple', defaultUnit: 'count' });
    createIngredient(db, { name: 'Butter', slug: 'butter', defaultUnit: 'g' });
    createVariant(db, {
      ingredientId: banana.id,
      name: 'Raw',
      slug: 'raw',
      defaultUnit: 'count',
    });
    createVariant(db, {
      ingredientId: apple.id,
      name: 'Raw',
      slug: 'raw',
      defaultUnit: 'count',
    });
    createPrepState(db, { name: 'Mashed', slug: 'mashed' });
  });

  it('resolves known ingredients + variants + prep_state cleanly', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, banana:raw:mashed, 250:g)
@ingredient(2, butter, 10:g)
@step("Mash @1 with @2.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.creations).toHaveLength(0);
    expect(result.proposedSlugs).toHaveLength(0);
    const ing1 = result.resolved.blocks.find(
      (b): b is ResolvedIngredientBlock => b.kind === 'ingredient' && b.index === 1
    );
    expect(ing1?.ingredientId).not.toBeNull();
    expect(ing1?.variantId).not.toBeNull();
    expect(ing1?.prepStateId).not.toBeNull();
  });

  it('keeps banana:raw and apple:raw as distinct variantIds (per-parent scoping)', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, banana:raw, 1:count)
@ingredient(2, apple:raw, 2:count)
@step("Use @1 and @2.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ings = result.resolved.blocks.filter(
      (b): b is ResolvedIngredientBlock => b.kind === 'ingredient'
    );
    expect(ings[0]?.variantId).not.toBeNull();
    expect(ings[1]?.variantId).not.toBeNull();
    expect(ings[0]?.variantId).not.toBe(ings[1]?.variantId);
  });

  it('treats `banana:_:mashed` as null variant + mashed prep', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, banana:_:mashed, 1:count)
@step("Use @1.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ing1 = result.resolved.blocks.find(
      (b): b is ResolvedIngredientBlock => b.kind === 'ingredient'
    );
    expect(ing1?.variantId).toBeNull();
    expect(ing1?.prepStateId).not.toBeNull();
  });

  it('resolves step `@slug` against a same-slug @ingredient block', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, banana:raw, 1:count)
@step("Use @banana directly.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step = result.resolved.blocks.find((b): b is ResolvedStepBlock => b.kind === 'step');
    const ref = step?.bodyResolved.find((p) => p.kind === 'ref');
    expect(ref?.kind).toBe('ref');
    if (ref?.kind === 'ref') {
      expect(ref.ingredientId).not.toBeNull();
    }
  });
});

describe('resolver: auto-creation', () => {
  let db: FoodDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('unknown ingredient slug emits an ingredient creation, not an error', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, made-up-thing, 250:g)
@step("Use @1.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.creations.map((c) => c.slug)).toContain('made-up-thing');
    const ing1 = result.resolved.blocks.find(
      (b): b is ResolvedIngredientBlock => b.kind === 'ingredient'
    );
    expect(ing1?.ingredientId).toBeNull();
  });

  it('unknown variant slug under a known ingredient emits a variant creation', () => {
    createIngredient(db, { name: 'Tomato', slug: 'tomato', defaultUnit: 'g' });
    const ast = parse(`@recipe(slug="x", title="X")
@yield(tomato, 250:g)
@ingredient(1, tomato:roasted, 250:g)
@step("Roast @1.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const variantCreation = result.creations.find((c) => c.kind === 'variant');
    expect(variantCreation?.slug).toBe('roasted');
  });

  it('deriveFromQty picks `g` for kg-family, `ml` for volume, `count` fallback', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(out, 1:count)
@ingredient(1, weight-thing, 1:kg)
@ingredient(2, volume-thing, 100:tbsp)
@ingredient(3, unknown-thing, 1:packet)
@step("Mix @1, @2, @3.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byCreatedSlug = new Map(result.creations.map((c) => [c.slug, c]));
    expect(byCreatedSlug.get('weight-thing')?.defaultUnit).toBe('g');
    expect(byCreatedSlug.get('volume-thing')?.defaultUnit).toBe('ml');
    expect(byCreatedSlug.get('unknown-thing')?.defaultUnit).toBe('count');
  });
});

describe('resolver: error codes', () => {
  let db: FoodDb;
  beforeEach(() => {
    db = freshDb();
    createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
    createPrepState(db, { name: 'Mashed', slug: 'mashed' });
  });

  it('UnresolvedPrepStateSlug — unknown prep slug', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, banana:_:never-heard-of-this, 1:count)
@step("Use @1.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(errorCodes(result)).toContain('UnresolvedPrepStateSlug');
    expect(result.proposedSlugs.map((p) => p.slug)).toContain('never-heard-of-this');
  });

  it('WrongKindForContext — prep slug as ingredient head', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, mashed, 1:count)
@step("Use @1.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(errorCodes(result)).toContain('WrongKindForContext');
  });

  it('WrongKindForContext — prep slug as yield head', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(mashed, 1:count)
@ingredient(1, banana, 1:count)
@step("Use @1.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(errorCodes(result)).toContain('WrongKindForContext');
  });

  it('UnresolvedStepRefIndex — @N in step body with no matching block', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, banana, 1:count)
@step("Use @99.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(errorCodes(result)).toContain('UnresolvedStepRefIndex');
  });

  it('UnresolvedStepRefSlug — @slug unknown + does NOT auto-create', () => {
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, banana, 1:count)
@step("Use @never-heard-of-this.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(errorCodes(result)).toContain('UnresolvedStepRefSlug');
    // Step refs are informational pointers, not declarations — no auto-create.
    expect(result.creations.map((c) => c.slug)).not.toContain('never-heard-of-this');
  });

  it('VariantOnRecipeRef — variant on a recipe ref', () => {
    const banana = createIngredient(db, {
      name: 'Banana2',
      slug: 'banana-2',
      defaultUnit: 'count',
    });
    const created = createRecipe(db, {
      slug: 'smash',
      firstVersion: { title: 'Smash', bodyDsl: '@recipe(smash)' },
    });
    db.update(recipeVersions)
      .set({ compileStatus: 'compiled', yieldIngredientId: banana.id })
      .where(eq(recipeVersions.id, created.version.id))
      .run();
    promoteVersion(db, created.version.id);
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, smash:something, 1:count)
@step("Use @1.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(errorCodes(result)).toContain('VariantOnRecipeRef');
  });

  it('SelfReferenceRecipe — currentRecipeId matches an @ingredient recipe ref', () => {
    const created = createRecipe(db, {
      slug: 'looper',
      firstVersion: { title: 'Looper', bodyDsl: '@recipe(looper)' },
    });
    db.update(recipeVersions)
      .set({ compileStatus: 'compiled', yieldIngredientId: 1 })
      .where(eq(recipeVersions.id, created.version.id))
      .run();
    promoteVersion(db, created.version.id);
    const ast = parse(`@recipe(slug="looper", title="Looper")
@yield(banana, 1:count)
@ingredient(1, looper, 1:count)
@step("Use @1.")
`);
    const result = resolveRecipeAst(ast, { db, currentRecipeId: created.recipe.id });
    expect(errorCodes(result)).toContain('SelfReferenceRecipe');
  });

  it('YieldCannotBeRecipe — @yield references a recipe with no current version', () => {
    createRecipe(db, {
      slug: 'unpromoted',
      firstVersion: { title: 'Unpromoted', bodyDsl: '@recipe(unpromoted)' },
    });
    const ast = parse(`@recipe(slug="x", title="X")
@yield(unpromoted, 1:count)
@ingredient(1, banana, 1:count)
@step("Use @1.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(errorCodes(result)).toContain('YieldCannotBeRecipe');
  });
});

describe('resolver: mixed path', () => {
  it('two unknown slugs produce two errors + two proposedSlugs and AST is still returned', () => {
    const db = freshDb();
    createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
    createPrepState(db, { name: 'Mashed', slug: 'mashed' });
    const ast = parse(`@recipe(slug="x", title="X")
@yield(banana, 1:count)
@ingredient(1, banana:_:never-heard, 1:count)
@ingredient(2, banana, 1:count)
@step("Use @1, @2, and @also-never-heard.")
`);
    const result = resolveRecipeAst(ast, { db });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
    expect(result.proposedSlugs.map((p) => p.slug).toSorted()).toEqual(
      ['also-never-heard', 'never-heard'].toSorted()
    );
    // Even on error, a partial AST is returned so callers (inbox renderer,
    // error UIs) can show structure with the resolved bits filled in.
    expect(result.resolved.blocks).toHaveLength(3);
    const ing2 = result.resolved.blocks.find(
      (b): b is ResolvedIngredientBlock => b.kind === 'ingredient' && b.index === 2
    );
    expect(ing2?.ingredientId).not.toBeNull();
  });
});
