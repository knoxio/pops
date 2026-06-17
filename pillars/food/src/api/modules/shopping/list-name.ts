/**
 * Default list-name composer + provenance notes builder — PRD-152.
 *
 * Format: `"Shopping list — <d-MMM>"` for single-day ranges; otherwise
 * `"Shopping list — <d>-<d> <Mmm>"` when start + end share a month;
 * `"Shopping list — <d Mmm>-<d Mmm>"` when they span months. All in
 * en-AU short-month names — i18n at the list-name level is overkill for v1
 * since the user can rename freely before generate.
 *
 * `notes` per item: `"Plan <start>-<end> · <recipe titles joined by ', '>"`
 * front-truncated to 500 chars with `"…"` per AC.
 */
const MONTHS_SHORT = [
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

const NOTES_MAX = 500;
const ELLIPSIS = '…';

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function defaultListName(startDate: string, endDate: string): string {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start === null || end === null) return 'Shopping list';
  if (sameDay(start, end)) {
    return `Shopping list — ${start.day} ${MONTHS_SHORT[start.month - 1]}`;
  }
  if (start.year === end.year && start.month === end.month) {
    return `Shopping list — ${start.day}-${end.day} ${MONTHS_SHORT[start.month - 1]}`;
  }
  return `Shopping list — ${start.day} ${MONTHS_SHORT[start.month - 1]}-${end.day} ${MONTHS_SHORT[end.month - 1]}`;
}

export function buildItemNotes(
  startDate: string,
  endDate: string,
  recipeTitles: readonly string[]
): string {
  const prefix = `Plan ${startDate}-${endDate} · `;
  const titlesStr = recipeTitles.join(', ');
  const full = `${prefix}${titlesStr}`;
  if (full.length <= NOTES_MAX) return full;
  // Front-truncate the titles portion so the `Plan <start>-<end> ·` prefix
  // always survives — that's the provenance signal the UI relies on.
  const availableForTitles = NOTES_MAX - prefix.length - ELLIPSIS.length;
  if (availableForTitles <= 0) {
    // Pathological — the prefix alone exceeds the cap. Drop the titles.
    return full.slice(0, NOTES_MAX - ELLIPSIS.length) + ELLIPSIS;
  }
  const trimmedTitles = titlesStr.slice(titlesStr.length - availableForTitles);
  return `${prefix}${ELLIPSIS}${trimmedTitles}`;
}

function parseIsoDate(iso: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
}

function sameDay(a: DateParts, b: DateParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
