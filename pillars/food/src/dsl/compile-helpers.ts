import { inArray } from 'drizzle-orm';

import { ingredients } from '../db/schema.js';

import type { FoodDb } from '../db/services/internal.js';
import type { IngredientBlock, RecipeAst } from './ast.js';
import type { IngredientSlugMap, LineLabelMap } from './compile-md.js';
import type { ResolvedRecipeAst, ResolvedStepBlock } from './resolver-types.js';

export function serialiseSourceDescriptor(block: IngredientBlock): string {
  const parts: string[] = [block.descriptor.ingredient];
  if (block.descriptor.variant !== undefined || block.descriptor.prep !== undefined) {
    parts.push(block.descriptor.variant ?? '_');
  }
  if (block.descriptor.prep !== undefined) parts.push(block.descriptor.prep);
  return parts.join(':');
}

export function buildLineLabels(ast: RecipeAst): LineLabelMap {
  const out = new Map<number, string>();
  for (const block of ast.blocks) {
    if (block.kind === 'ingredient') {
      out.set(block.index, serialiseSourceDescriptor(block));
    }
  }
  return out;
}

export function buildIngredientDefaultUnitLookup(
  tx: FoodDb,
  resolved: ResolvedRecipeAst
): (ingredientId: number) => 'g' | 'ml' | 'count' {
  const ids = collectIngredientIds(resolved);
  const rows =
    ids.size === 0
      ? []
      : tx
          .select({ id: ingredients.id, defaultUnit: ingredients.defaultUnit })
          .from(ingredients)
          .where(inArray(ingredients.id, [...ids]))
          .all();
  const lookup = new Map<number, 'g' | 'ml' | 'count'>();
  for (const row of rows) lookup.set(row.id, row.defaultUnit);
  return (id) => lookup.get(id) ?? 'count';
}

/**
 * Build an `ingredients.id → ingredients.slug` lookup for every ingredient
 * referenced by the resolved AST (ingredient blocks + slug-only step refs).
 * Consumed by `compile-md` to render `@slug` step refs as
 * `[slug](#ingredient-slug)`.
 */
export function buildIngredientSlugLookup(
  tx: FoodDb,
  resolved: ResolvedRecipeAst
): IngredientSlugMap {
  const ids = collectIngredientIds(resolved);
  for (const block of resolved.blocks) {
    if (block.kind !== 'step') continue;
    for (const id of collectStepRefIngredientIds(block)) ids.add(id);
  }
  if (ids.size === 0) return new Map();
  const rows = tx
    .select({ id: ingredients.id, slug: ingredients.slug })
    .from(ingredients)
    .where(inArray(ingredients.id, [...ids]))
    .all();
  const lookup = new Map<number, string>();
  for (const row of rows) lookup.set(row.id, row.slug);
  return lookup;
}

function collectIngredientIds(resolved: ResolvedRecipeAst): Set<number> {
  const ids = new Set<number>();
  for (const block of resolved.blocks) {
    if (block.kind === 'ingredient' && block.ingredientId !== null) {
      ids.add(block.ingredientId);
    }
  }
  return ids;
}

function collectStepRefIngredientIds(block: ResolvedStepBlock): number[] {
  const ids: number[] = [];
  for (const part of block.bodyResolved) {
    if (part.kind === 'ref' && part.ingredientId !== null) ids.push(part.ingredientId);
  }
  return ids;
}
