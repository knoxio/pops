/**
 * The `default_unit` for an auto-created ingredient is derived from the
 * `qty:unit` it was first seen with. Unknown units fall through to `count`;
 * the user can refine in the management UI.
 */
import type { SourceSpan } from './ast.js';
import type { ResolverCreation } from './resolver-types.js';

type CanonicalUnit = 'g' | 'ml' | 'count';

const WEIGHT_UNITS = new Set(['g', 'kg', 'oz', 'lb']);
const VOLUME_UNITS = new Set(['ml', 'l', 'cup', 'tbsp', 'tsp', 'fl-oz']);
const COUNT_UNITS = new Set(['count', 'each', 'whole']);

export function deriveFromQty(unit: string): CanonicalUnit {
  const normalised = unit.toLowerCase();
  if (WEIGHT_UNITS.has(normalised)) return 'g';
  if (VOLUME_UNITS.has(normalised)) return 'ml';
  if (COUNT_UNITS.has(normalised)) return 'count';
  return 'count';
}

export function newIngredientCreation(
  slug: string,
  unit: string,
  fromLoc: SourceSpan
): ResolverCreation {
  return { kind: 'ingredient', slug, defaultUnit: deriveFromQty(unit), fromLoc };
}

export function newVariantCreation(
  parentIngredientSlug: string,
  slug: string,
  unit: string,
  fromLoc: SourceSpan
): ResolverCreation {
  return {
    kind: 'variant',
    parentIngredientSlug,
    slug,
    defaultUnit: deriveFromQty(unit),
    fromLoc,
  };
}
