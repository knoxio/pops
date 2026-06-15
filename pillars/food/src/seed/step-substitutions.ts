/**
 * PRD-113 seed step — substitutions.
 *
 * Maps fixture endpoints (slug-based) to (ingredient_id | variant_id) and
 * calls `createSubstitution`. Recipe-scoped fixtures resolve the recipe id
 * from the SeedContext (so this step MUST run after `seedRecipeHeaders`).
 */
import {
  createSubstitution,
  type CreateSubstitutionInput,
  type SubstitutionEndpoint,
} from '../db/services/substitutions.js';
import { SUBSTITUTION_FIXTURES } from './data-substitutions.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

function resolveEndpoint(
  side: 'from' | 'to',
  endpoint: (typeof SUBSTITUTION_FIXTURES)[number]['from'],
  ctx: SeedContext
): SubstitutionEndpoint {
  if (endpoint.ingredientSlug !== undefined) {
    const id = ctx.ingredientIdBySlug.get(endpoint.ingredientSlug);
    if (id === undefined) {
      throw new Error(`Sub ${side} ingredient "${endpoint.ingredientSlug}" missing from ctx`);
    }
    return { ingredientId: id };
  }
  if (endpoint.variantOfIngredient !== undefined && endpoint.variantSlug !== undefined) {
    const key = `${endpoint.variantOfIngredient}:${endpoint.variantSlug}`;
    const id = ctx.variantIdByCompositeSlug.get(key);
    if (id === undefined) {
      throw new Error(`Sub ${side} variant "${key}" missing from ctx`);
    }
    return { variantId: id };
  }
  throw new Error(`Sub ${side} endpoint has neither ingredient nor variant`);
}

function resolveRecipeId(
  fixture: (typeof SUBSTITUTION_FIXTURES)[number],
  ctx: SeedContext
): number | null {
  if ((fixture.scope ?? 'global') !== 'recipe') return null;
  // Defensive: a fixture declaring scope='recipe' without recipeSlug would
  // otherwise silently insert a recipe-scoped sub with NULL recipe_id —
  // violating PRD-109 invariants. Fail loud at seed time.
  if (fixture.recipeSlug === undefined) {
    throw new Error(`Sub fixture has scope='recipe' but no recipeSlug`);
  }
  const id = ctx.recipeIdBySlug.get(fixture.recipeSlug);
  if (id === undefined) {
    throw new Error(`Sub fixture references unknown recipe "${fixture.recipeSlug}"`);
  }
  return id;
}

function buildInput(
  fixture: (typeof SUBSTITUTION_FIXTURES)[number],
  ctx: SeedContext
): CreateSubstitutionInput {
  return {
    from: resolveEndpoint('from', fixture.from, ctx),
    to: resolveEndpoint('to', fixture.to, ctx),
    ratio: fixture.ratio,
    contextTags: fixture.contextTags,
    scope: fixture.scope ?? 'global',
    recipeId: resolveRecipeId(fixture, ctx),
    notes: fixture.notes ?? null,
  };
}

export function seedSubstitutions(db: FoodDb, ctx: SeedContext): number {
  for (const fixture of SUBSTITUTION_FIXTURES) {
    createSubstitution(db, buildInput(fixture, ctx));
  }
  return SUBSTITUTION_FIXTURES.length;
}
