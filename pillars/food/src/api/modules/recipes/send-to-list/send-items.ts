import { composeLabel } from './compose-label.js';
import { buildCanonicalItem, buildUnconvertedItem, formatQty } from './label.js';

/**
 * Bridges the aggregate output into the row-shaped `SendItem` structures the
 * send loop iterates over. Carries the ingredient + variant names alongside
 * the wire-shape `PreviewItem` so the merge step can regenerate the label
 * after summing without re-querying.
 */
import type { AggregateResult, UnconvertedAggregate } from './aggregate.js';
import type { AggregatedCanonical, PreviewItem } from './types.js';

export type SendItemRefKind = 'ingredient' | 'variant' | 'free';

export interface SendItem {
  preview: PreviewItem;
  refKind: SendItemRefKind;
  /** Null when `refKind='free'`. */
  refId: number | null;
  /** Ingredient name for label regeneration after merge. */
  ingredientName: string;
  /** Variant name for label regeneration after merge. May be null. */
  variantName: string | null;
  /** Joined prep-state label (e.g. "diced, sliced") for label regeneration. */
  prepLabel: string | null;
  /** Canonical items can merge; unconverted lines always insert fresh. */
  mergeable: boolean;
}

export function buildSendItems(agg: AggregateResult): SendItem[] {
  return [...agg.canonical.map(canonicalToSendItem), ...agg.unconverted.map(unconvertedToSendItem)];
}

function canonicalToSendItem(agg: AggregatedCanonical): SendItem {
  return {
    preview: buildCanonicalItem(agg),
    refKind: agg.variantId === null ? 'ingredient' : 'variant',
    refId: agg.variantId ?? agg.ingredientId,
    ingredientName: agg.ingredientName,
    variantName: agg.variantName,
    prepLabel: agg.prepSlugs.size === 0 ? null : [...agg.prepSlugs].toSorted().join(', '),
    mergeable: true,
  };
}

function unconvertedToSendItem(row: UnconvertedAggregate): SendItem {
  return {
    preview: buildUnconvertedItem(row),
    // Unconverted lines never merge — keep refKind='free' so a later
    // canonical send for the same ingredient (different unit) doesn't
    // collide with the raw line.
    refKind: 'free',
    refId: null,
    ingredientName: row.ingredientName,
    variantName: row.variantName,
    prepLabel: row.prepStateName,
    mergeable: false,
  };
}

/**
 * Rebuild a list-item label after a merge bumps the qty, reusing the shared
 * `composeLabel` so the regenerated label matches the preview format.
 */
export function relabelAfterMerge(item: SendItem, newQty: number): string {
  return composeLabel({
    qty: formatQty(newQty),
    unit: item.preview.unit ?? '',
    ingredientName: item.ingredientName,
    variantName: item.variantName,
    prepLabel: item.prepLabel,
  });
}
