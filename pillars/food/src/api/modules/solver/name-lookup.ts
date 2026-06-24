/**
 * Bulk-load ingredient + variant name dictionaries for the solver —
 * pillars/food/docs/prds/cook-solver.
 *
 * Substitution candidates carry only (ingredientId, variantId) ids;
 * the breakdown the UI renders needs human names. One name lookup at
 * the start of the request beats N per-edge queries.
 */
import { ingredientVariants, ingredients, type FoodDb } from '../../../db/index.js';

export interface NameLookup {
  ingredientName(id: number): string;
  variantName(id: number): string | null;
  /** Parent ingredient ID for a variant ID, or null if unknown. */
  variantIngredient(id: number): number | null;
}

interface NameMaps {
  ingredients: ReadonlyMap<number, string>;
  variants: ReadonlyMap<number, { name: string; ingredientId: number }>;
}

function loadNames(db: FoodDb): NameMaps {
  const ingRows = db.select({ id: ingredients.id, name: ingredients.name }).from(ingredients).all();
  const varRows = db
    .select({
      id: ingredientVariants.id,
      name: ingredientVariants.name,
      ingredientId: ingredientVariants.ingredientId,
    })
    .from(ingredientVariants)
    .all();
  const ingMap = new Map<number, string>();
  for (const row of ingRows) ingMap.set(row.id, row.name);
  const varMap = new Map<number, { name: string; ingredientId: number }>();
  for (const row of varRows) varMap.set(row.id, { name: row.name, ingredientId: row.ingredientId });
  return { ingredients: ingMap, variants: varMap };
}

export function buildNameLookup(db: FoodDb): NameLookup {
  const maps = loadNames(db);
  return {
    ingredientName(id: number): string {
      return maps.ingredients.get(id) ?? `#${id}`;
    },
    variantName(id: number): string | null {
      return maps.variants.get(id)?.name ?? null;
    },
    variantIngredient(id: number): number | null {
      return maps.variants.get(id)?.ingredientId ?? null;
    },
  };
}

/**
 * Compose a human-readable label for a sub candidate target. When the
 * edge only sets `to_variant_id`, the parent ingredient is looked up
 * via the name dictionary so the label still leads with the ingredient
 * name ("coconut-oil (refined)") instead of the bare variant slug
 * ("refined") — that would be unreadable in the UI.
 */
export function describeCandidate(
  names: NameLookup,
  toIngredientId: number | null,
  toVariantId: number | null
): string {
  if (toVariantId !== null) {
    const varName = names.variantName(toVariantId);
    const parent = toIngredientId ?? names.variantIngredient(toVariantId);
    const parentName = parent !== null ? names.ingredientName(parent) : null;
    if (varName !== null && parentName !== null) return `${parentName} (${varName})`;
    if (parentName !== null) return parentName;
    if (varName !== null) return varName;
    return `variant#${toVariantId}`;
  }
  if (toIngredientId !== null) return names.ingredientName(toIngredientId);
  return '—';
}
