/**
 * Date-range helpers for the FromPlanPage — PRD-152.
 *
 * Keeps the date math out of the component so the tests can exercise the
 * "↺ This week" snap, the +6 default, and the > 90-day client-side gate
 * without rendering the page.
 */

const MS_PER_DAY = 86_400_000;
const MAX_RANGE_DAYS = 90;

export function todayIso(today: Date = new Date()): string {
  return formatIso(today);
}

export function addDaysIso(iso: string, days: number): string {
  const parsed = parseIsoDate(iso);
  if (parsed === null) return iso;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + days);
  return formatIso(next);
}

export function defaultRange(today: Date = new Date()): { start: string; end: string } {
  const start = formatIso(today);
  return { start, end: addDaysIso(start, 6) };
}

export function isoMondayFor(today: Date = new Date()): string {
  // toISOString is in UTC; map to ISO Monday by walking back to dow=1.
  const utc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dow = utc.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return formatIso(utc);
}

export function isoSundayFor(today: Date = new Date()): string {
  return addDaysIso(isoMondayFor(today), 6);
}

export interface RangeValidationOk {
  ok: true;
  days: number;
}

export interface RangeValidationErr {
  ok: false;
  reason: 'EndBeforeStart' | 'TooLong' | 'BadFormat';
}

export type RangeValidation = RangeValidationOk | RangeValidationErr;

export function validateRange(start: string, end: string): RangeValidation {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (a === null || b === null) return { ok: false, reason: 'BadFormat' };
  if (b < a) return { ok: false, reason: 'EndBeforeStart' };
  const days = Math.round((b - a) / MS_PER_DAY) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, reason: 'TooLong' };
  return { ok: true, days };
}

function formatIso(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}
