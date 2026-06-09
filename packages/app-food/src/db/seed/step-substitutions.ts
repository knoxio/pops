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
} from '../services/substitutions';
import { SUBSTITUTION_FIXTURES } from './data-substitutions';

import type { FoodDb } from '../services/internal';
import type { SeedContext } from './types';

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

function buildInput(
  fixture: (typeof SUBSTITUTION_FIXTURES)[number],
  ctx: SeedContext
): CreateSubstitutionInput {
  const from = resolveEndpoint('from', fixture.from, ctx);
  const to = resolveEndpoint('to', fixture.to, ctx);
  const scope = fixture.scope ?? 'global';
  const recipeId =
    scope === 'recipe' && fixture.recipeSlug !== undefined
      ? ctx.recipeIdBySlug.get(fixture.recipeSlug)
      : null;
  if (scope === 'recipe' && recipeId === undefined) {
    throw new Error(`Sub recipe scope requires known recipe; "${fixture.recipeSlug}" missing`);
  }
  return {
    from,
    to,
    ratio: fixture.ratio,
    contextTags: fixture.contextTags,
    scope,
    recipeId: recipeId ?? null,
    notes: fixture.notes ?? null,
  };
}

export function seedSubstitutions(db: FoodDb, ctx: SeedContext): number {
  for (const fixture of SUBSTITUTION_FIXTURES) {
    createSubstitution(db, buildInput(fixture, ctx));
  }
  return SUBSTITUTION_FIXTURES.length;
}
