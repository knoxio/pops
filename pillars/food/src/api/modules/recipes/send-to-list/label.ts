import { composeLabel } from './compose-label.js';

/**
 * Label-builder helpers for the preview items.
 *
 * Canonical format: `"<qty> <unit> <ingredient_name>[ <variant_name>][ (<prep_states joined with ', '>)]"`
 * Unconverted format: `"<original_qty> <original_unit> <ingredient_name>[ <variant_name>][ (<prep_state>)]"`.
 *
 * Numbers render compact: integers stay as integers, fractionals round to
 * two decimal places (matches the way the recipe renderer displays qty).
 */
import type { UnconvertedAggregate } from './aggregate.js';
import type { AggregatedCanonical, PreviewItem } from './types.js';

const DECIMALS = 2;

export function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  const rounded = Math.round(qty * 10 ** DECIMALS) / 10 ** DECIMALS;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toString();
}

export function buildCanonicalItem(agg: AggregatedCanonical): PreviewItem {
  const prepLabel = prepStatesLabel([...agg.prepSlugs].toSorted());
  const label = composeLabel({
    qty: formatQty(agg.qtySum),
    unit: agg.canonicalUnit,
    ingredientName: agg.ingredientName,
    variantName: agg.variantName,
    prepLabel,
  });
  return {
    label,
    qty: agg.qtySum,
    unit: agg.canonicalUnit,
    ingredientId: agg.ingredientId,
    variantId: agg.variantId,
    prepStateLabel: prepLabel,
    sourceLineIds: [...agg.sourceLineIds],
  };
}

export function buildUnconvertedItem(row: UnconvertedAggregate): PreviewItem {
  const label = composeLabel({
    qty: formatQty(row.originalQty),
    unit: row.originalUnit,
    ingredientName: row.ingredientName,
    variantName: row.variantName,
    prepLabel: row.prepStateName,
  });
  return {
    label,
    qty: row.originalQty,
    unit: row.originalUnit,
    ingredientId: row.ingredientId,
    variantId: row.variantId,
    prepStateLabel: row.prepStateName,
    sourceLineIds: [row.lineId],
  };
}

function prepStatesLabel(slugs: readonly string[]): string | null {
  if (slugs.length === 0) return null;
  return slugs.join(', ');
}
