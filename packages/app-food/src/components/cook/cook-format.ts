/**
 * PRD-146 — display formatters shared by the cook-modal panels.
 */
import type { BatchUnit } from '@pops/app-food-db';

const QTY_FORMATTER = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 });

export function formatQty(qty: number): string {
  return QTY_FORMATTER.format(qty);
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
