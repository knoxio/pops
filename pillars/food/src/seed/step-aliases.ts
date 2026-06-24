/**
 * Seed step — ingredient_aliases.
 *
 * Writes via direct Drizzle insert. Source is recorded as 'user' since that's
 * the canonical "human-curated" value in the alias-source enum.
 */
import { ingredientAliases } from '../db/schema.js';
import { ALIAS_FIXTURES } from './data-aliases.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

function resolveAliasTarget(
  fixture: (typeof ALIAS_FIXTURES)[number],
  ctx: SeedContext
): { ingredientId: number | null; variantId: number | null } {
  if (fixture.ingredientSlug !== undefined) {
    const id = ctx.ingredientIdBySlug.get(fixture.ingredientSlug);
    if (id === undefined) {
      throw new Error(`Alias target ingredient "${fixture.ingredientSlug}" missing from seed ctx`);
    }
    return { ingredientId: id, variantId: null };
  }
  if (fixture.variantOfIngredient !== undefined && fixture.variantSlug !== undefined) {
    const key = `${fixture.variantOfIngredient}:${fixture.variantSlug}`;
    const id = ctx.variantIdByCompositeSlug.get(key);
    if (id === undefined) {
      throw new Error(`Alias target variant "${key}" missing from seed ctx`);
    }
    return { ingredientId: null, variantId: id };
  }
  throw new Error(`Alias "${fixture.alias}" has neither ingredient nor variant target`);
}

export function seedAliases(db: FoodDb, ctx: SeedContext): number {
  for (const fixture of ALIAS_FIXTURES) {
    const target = resolveAliasTarget(fixture, ctx);
    db.insert(ingredientAliases)
      .values({
        ingredientId: target.ingredientId,
        variantId: target.variantId,
        alias: fixture.alias,
        source: 'user',
      })
      .run();
  }
  return ALIAS_FIXTURES.length;
}
