/**
 * Pure helpers shared across `RecipeRenderer` subcomponents — PRD-121.
 *
 * Everything here is deterministic. `scaleFactor` clamping, yield-label
 * assembly, canonical-quantity selection, and anchor matching are written
 * as pure functions so the test suite can exercise edge cases without
 * mounting React.
 */
import type { IngredientRow, IngredientVariantRow, PrepStateRow } from '@pops/db-types';

import type { RecipeLineWithResolved } from './RecipeRenderer.types';

/**
 * `scaleFactor=0` or negative is clamped to 1.0 per PRD AC line 229 — the
 * caller may still pass valid fractional / large scales like 0.5 or 4.
 * Emits a one-shot console warning so authoring bugs surface in dev.
 */
export function clampScaleFactor(input: number | undefined): number {
  if (input === undefined) return 1;
  if (Number.isFinite(input) && input > 0) return input;
  console.warn(`[RecipeRenderer] scaleFactor=${input} is invalid; clamping to 1.0`);
  return 1;
}

/**
 * Select the canonical quantity for the line's `canonical_unit`. Returns
 * `null` when conversion failed (all three qty columns null) — PRD edge
 * case "Show original text only".
 */
export function lineCanonicalQty(line: RecipeLineWithResolved): number | null {
  switch (line.canonicalUnit) {
    case 'g':
      return line.qtyG;
    case 'ml':
      return line.qtyMl;
    case 'count':
      return line.qtyCount;
  }
}

/**
 * Format a numeric quantity for display — integers stay integer, fractions
 * round to two decimals and strip trailing zeros (so `0.50` becomes `0.5`).
 */
export function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Assemble the yield label per PRD line 118:
 *   "Roma tomato, braised, shredded (500 g)"
 * Falls back to ingredient name alone when variant + prep are null.
 */
export function buildYieldLabel(args: {
  ingredient: IngredientRow | null;
  variant: IngredientVariantRow | null;
  prepState: PrepStateRow | null;
  qty: number | null;
  unit: string | null;
  scaleFactor: number;
}): string | null {
  const { ingredient, variant, prepState, qty, unit, scaleFactor } = args;
  if (!ingredient) return null;
  const labelParts: string[] = [ingredient.name];
  if (variant) labelParts.push(variant.name);
  if (prepState) labelParts.push(prepState.name);
  const label = labelParts.join(', ');
  if (qty === null || unit === null) return label;
  const scaled = qty * scaleFactor;
  return `${label} (${formatQty(scaled)} ${unit})`;
}

/**
 * DOM id used to scroll-target an ingredient list row from a step ref —
 * matches the `#line-N` anchor PRD-116 writes into `body_md`.
 */
export function lineAnchorId(position: number): string {
  return `line-${position}`;
}

/**
 * Match the `href` attribute on an `<a>` rendered by `react-markdown` to
 * one of the structured anchor namespaces. Returns the parsed shape so the
 * markdown override can swap to the right React component.
 *
 *   `#line-3`            → { kind: 'lineRef',  index: 3 }
 *   `#ingredient-banana` → { kind: 'slugRef',  slug: 'banana' }
 *   `#timer`             → { kind: 'timer' }
 *   `#temperature`       → { kind: 'temperature' }
 *   anything else        → null (renderer falls through to default <a>)
 */
export type StructuralAnchor =
  | { kind: 'lineRef'; index: number }
  | { kind: 'slugRef'; slug: string }
  | { kind: 'timer' }
  | { kind: 'temperature' };

export function parseStructuralAnchor(href: string | undefined): StructuralAnchor | null {
  if (!href) return null;
  if (href === '#timer') return { kind: 'timer' };
  if (href === '#temperature') return { kind: 'temperature' };
  const lineMatch = /^#line-(\d+)$/.exec(href);
  if (lineMatch && lineMatch[1]) return { kind: 'lineRef', index: Number(lineMatch[1]) };
  const slugMatch = /^#ingredient-(.+)$/.exec(href);
  if (slugMatch && slugMatch[1]) return { kind: 'slugRef', slug: slugMatch[1] };
  return null;
}
