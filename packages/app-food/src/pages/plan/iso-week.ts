/**
 * Client-side ISO-week helpers — mirrors the server's `iso-week.ts`.
 *
 * The PRD specifies ISO Monday weeks in the user's local timezone for
 * UI display. Both inputs and outputs are `YYYY-MM-DD` strings.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class BadClientDateError extends Error {
  readonly input: string;
  constructor(input: string) {
    super(`Bad date: ${input}`);
    this.name = 'BadClientDateError';
    this.input = input;
  }
}

function parseLocalDate(input: string): Date {
  const match = ISO_DATE_RE.exec(input);
  if (match === null) throw new BadClientDateError(input);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    throw new BadClientDateError(input);
  }
  return d;
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toIsoMonday(input: string): string {
  const d = parseLocalDate(input);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return formatLocalDate(d);
}

export function addDays(input: string, days: number): string {
  const d = parseLocalDate(input);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

export function weekDates(monday: string): readonly string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function isPastDate(date: string, today: Date = new Date()): boolean {
  return date < formatLocalDate(today);
}

export interface FormattedWeekLabel {
  long: string;
  short: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatDayLabel(date: string, index: number): string {
  const d = parseLocalDate(date);
  const day = DAYS[index] ?? '';
  return `${day} ${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

export function formatWeekLabel(monday: string): FormattedWeekLabel {
  const start = parseLocalDate(monday);
  const end = parseLocalDate(addDays(monday, 6));
  const startStr = `${start.getDate()} ${MONTHS[start.getMonth()] ?? ''}`;
  const endStr = `${end.getDate()} ${MONTHS[end.getMonth()] ?? ''} ${end.getFullYear()}`;
  return { long: `Week of ${startStr} — ${endStr}`, short: `${startStr} — ${endStr}` };
}
