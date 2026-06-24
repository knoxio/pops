/**
 * Display formatters shared by the cook-modal panels.
 *
 * `formatQty` mirrors `RecipeRenderer.helpers.formatQty` so quantity
 * formatting stays consistent across the food surfaces (integer →
 * plain digits; otherwise two decimals with trailing zeros trimmed).
 * No thousands separator — matches the existing convention.
 */
import type { BatchUnit } from '../../food-api-shared-types.js';

export function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(2).replace(/\.?0+$/, '');
}

export function formatUnit(unit: BatchUnit): string {
  return unit === 'count' ? '' : ` ${unit}`;
}

export function formatExpiryDate(iso: string | null): string | null {
  if (iso === null) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toISOString().slice(0, 10);
}
