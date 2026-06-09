/**
 * Pure helpers for the PRD-116 compile pipeline.
 *
 * Kept separate so `compile.ts` stays within the 200-line file cap.
 */
import { inArray } from 'drizzle-orm';

import { ingredients } from '../db/schema';

import type { FoodDb } from '../db/services/internal';
import type { IngredientBlock, RecipeAst } from './ast';
import type { LineLabelMap } from './compile-md';
import type { ResolvedRecipeAst } from './resolver-types';

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
  const ids = new Set<number>();
  for (const block of resolved.blocks) {
    if (block.kind === 'ingredient' && block.ingredientId !== null) {
      ids.add(block.ingredientId);
    }
  }
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
