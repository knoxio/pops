/**
 * Notes-field helpers for PRD-142's send-to-list flow.
 *
 * - `MAX_NOTES_LENGTH = 500` (PRD §Business Rules).
 * - `appendNote` joins with `; ` and truncates from the front with `…` when
 *   the combined length exceeds the cap (oldest entries lost first).
 * - `escapeLike` defends the "already sent" LIKE query against `%`/`_` in
 *   recipe titles — PRD §Edge Cases pins this as server-side.
 */
export const MAX_NOTES_LENGTH = 500;

const TRUNCATION_MARKER = '…';
const SEPARATOR = '; ';

/**
 * Combine an existing notes field with a new entry, joining with `; ` and
 * truncating from the front (oldest entries first) when the result would
 * exceed `MAX_NOTES_LENGTH`. Prepends `…` to signal truncation.
 *
 * Truncates at separator boundaries so individual entries stay readable.
 * If the new entry alone exceeds the cap, the result is still capped (it
 * gets hard-truncated from the front by the same rule).
 */
export function appendNote(existing: string | null, addition: string): string {
  const next =
    existing === null || existing === '' ? addition : `${existing}${SEPARATOR}${addition}`;
  if (next.length <= MAX_NOTES_LENGTH) return next;
  // Reserve one char for the truncation marker.
  const budget = MAX_NOTES_LENGTH - TRUNCATION_MARKER.length;
  // Find the next separator boundary after the truncation point so we don't
  // mid-cut an entry; fall back to a hard cut if no separator fits.
  const cutFrom = next.length - budget;
  const boundary = next.indexOf(SEPARATOR, cutFrom);
  if (boundary === -1 || boundary >= next.length - 1) {
    return TRUNCATION_MARKER + next.slice(cutFrom);
  }
  return TRUNCATION_MARKER + next.slice(boundary + SEPARATOR.length);
}

/**
 * Escape `%` and `_` for SQLite's default LIKE so a recipe title containing
 * those characters doesn't act as a wildcard. The caller must pair this with
 * a parameterised LIKE clause that uses `'\\'` as the ESCAPE character.
 */
export function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
