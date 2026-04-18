/**
 * Deterministic engram IDs.
 *
 * An engram's ID is a human-readable stamp: `eng_{YYYYMMDD}_{HHmm}_{slug}`.
 * It also doubles as the filename, so the format must be filesystem-safe and
 * stable across machines. Collisions are extremely unlikely inside a single
 * minute on a single-user system, but we still append a counter suffix when
 * two engrams share a title and minute.
 */

const MAX_SLUG_LENGTH = 40;

/**
 * Normalize a title into a filesystem-safe slug. Strips diacritics, lowercases,
 * replaces non-alphanumerics with hyphens, collapses runs, and trims.
 */
export function slugify(title: string): string {
  const normalized = title
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  if (normalized.length === 0) return 'untitled';
  return normalized.slice(0, MAX_SLUG_LENGTH).replaceAll(/-+$/g, '') || 'untitled';
}

/** Format a Date as the `YYYYMMDD_HHmm` timestamp used in engram IDs. */
export function formatIdTimestamp(date: Date): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  const yyyy = pad(date.getFullYear(), 4);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}${mm}${dd}_${hh}${min}`;
}

export interface GenerateIdInput {
  title: string;
  now?: Date;
  /**
   * Collision probe — should return true if the candidate ID is already taken.
   * The caller owns the lookup (disk, index, or both).
   */
  isTaken?: (candidate: string) => boolean;
}

/**
 * Generate a unique engram ID from a title. Appends `_2`, `_3`, … when the
 * caller reports a collision.
 */
export function generateEngramId(input: GenerateIdInput): string {
  const { title, now = new Date(), isTaken } = input;
  const base = `eng_${formatIdTimestamp(now)}_${slugify(title)}`;
  if (!isTaken || !isTaken(base)) return base;

  let suffix = 2;
  while (isTaken(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}
