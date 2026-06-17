/**
 * Pure ISO-week date helpers — no external dep.
 *
 * `toIsoMonday` normalises any `YYYY-MM-DD` to the Monday of the
 * containing ISO week. Invalid input throws — the router maps this to
 * an INPUT validation error so the UI can fall back to "current week".
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class BadIsoDateError extends Error {
  readonly input: string;
  constructor(input: string) {
    super(`Invalid ISO date: "${input}"`);
    this.name = 'BadIsoDateError';
    this.input = input;
  }
}

/**
 * Parse a strict `YYYY-MM-DD` into a UTC date. We use UTC throughout to
 * keep day arithmetic free of DST surprises — the wire format carries
 * no time-of-day so timezone is irrelevant.
 */
export function isValidIsoDate(input: string): boolean {
  try {
    parseIsoDateUtc(input);
    return true;
  } catch {
    return false;
  }
}

function parseIsoDateUtc(input: string): Date {
  const match = ISO_DATE_RE.exec(input);
  if (match === null) throw new BadIsoDateError(input);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new BadIsoDateError(input);
  }
  return d;
}

function formatIsoDateUtc(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toIsoMonday(input: string): string {
  const d = parseIsoDateUtc(input);
  // JS: getUTCDay() returns 0=Sun..6=Sat. ISO: 1=Mon..7=Sun.
  const isoDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const offset = isoDow - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return formatIsoDateUtc(d);
}

export function isoDateAddDays(input: string, days: number): string {
  const d = parseIsoDateUtc(input);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDateUtc(d);
}
