/**
 * Display formatters for fridge rows — qty + expiry strings.
 */

import type { BatchUnit } from '../../food-api-shared-types.js';

export function formatQty(qty: number, unit: BatchUnit): string {
  if (unit === 'count') {
    const n = Math.round(qty * 100) / 100;
    return `${n} ct`;
  }
  if (qty >= 1000) {
    const kilo = Math.round((qty / 1000) * 100) / 100;
    return `${kilo} ${unit === 'g' ? 'kg' : 'L'}`;
  }
  const n = Math.round(qty * 100) / 100;
  return `${n} ${unit}`;
}

export function formatExpiry(expiresAt: string | null, daysToExpiry: number | null): string {
  if (expiresAt === null) return '—';
  const date = new Date(expiresAt);
  // Date-only stamps come back as UTC midnight. We render in UTC so the
  // visible day matches `daysToExpiry` (which is also UTC-anchored);
  // showing the local-tz day would skew by one in negative offsets.
  const formatted = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  if (daysToExpiry === null) return `Exp ${formatted}`;
  if (daysToExpiry === 0) return `Exp ${formatted} (today)`;
  if (daysToExpiry > 0) return `Exp ${formatted} (in ${daysToExpiry}d)`;
  return `Exp ${formatted} (expired ${-daysToExpiry}d ago)`;
}

export type ExpiryUrgency = 'expired' | 'soon' | 'normal' | 'unknown';

export function urgencyFor(daysToExpiry: number | null): ExpiryUrgency {
  if (daysToExpiry === null) return 'unknown';
  if (daysToExpiry < 0) return 'expired';
  if (daysToExpiry <= 3) return 'soon';
  return 'normal';
}
