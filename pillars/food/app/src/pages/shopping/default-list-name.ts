/**
 * Client-side default list-name composer — keeps the page in sync with the
 * server-side default used when the user accepts whatever's in the input
 * box.
 *
 * Format mirrors `pillars/food/src/api/modules/shopping/list-name.ts`.
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

export function defaultListName(startDate: string, endDate: string): string {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start === null || end === null) return 'Shopping list';
  if (sameDay(start, end)) {
    return `Shopping list — ${String(start.day)} ${MONTHS_SHORT[start.month - 1]}`;
  }
  if (start.year === end.year && start.month === end.month) {
    return `Shopping list — ${String(start.day)}-${String(end.day)} ${MONTHS_SHORT[start.month - 1]}`;
  }
  return `Shopping list — ${String(start.day)} ${MONTHS_SHORT[start.month - 1]}-${String(end.day)} ${MONTHS_SHORT[end.month - 1]}`;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseIsoDate(iso: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function sameDay(a: DateParts, b: DateParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
