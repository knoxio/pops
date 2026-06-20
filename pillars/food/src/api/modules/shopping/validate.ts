/**
 * Date-range validation — PRD-152.
 *
 * Both ends inclusive. End must be ≥ start; range ≤ 90 days (cap).
 * Returns a discriminated result so the caller can route to either the
 * preview path or the `BadDateRange` error without throws.
 */
import { MAX_RANGE_DAYS } from './inputs.js';

export type ValidateRangeResult =
  | { ok: true; days: number }
  | { ok: false; reason: 'BadDateRange' };

const MS_PER_DAY = 86_400_000;

export function validateDateRange(startDate: string, endDate: string): ValidateRangeResult {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start === null || end === null) return { ok: false, reason: 'BadDateRange' };
  if (end < start) return { ok: false, reason: 'BadDateRange' };
  const days = Math.round((end - start) / MS_PER_DAY) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, reason: 'BadDateRange' };
  return { ok: true, days };
}

function parseIsoDate(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return ms;
}
