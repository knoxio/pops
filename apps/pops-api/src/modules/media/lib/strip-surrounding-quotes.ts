/**
 * Strip balanced surrounding double-quote characters from a media title.
 *
 * Mirrors the semantics of migration `0042_strip_quoted_movie_titles.sql`
 * (and its TV-shows companion `0051`), which uses SQLite
 * `TRIM(title, '"')` gated by `title LIKE '"%"'` and
 * `TRIM(title, '"') != ''`.
 *
 * Use at upstream client mappers (TMDB / TheTVDB) so that titles returned
 * by the source API with surrounding quotes never reach the database in
 * that form (issues #2402 / #2403; root cause of #2343 — *Wuthering
 * Heights* 2026 returned by TMDB as `"Wuthering Heights"`).
 *
 * Rules:
 * - Must start AND end with `"` — one-sided quotes are preserved.
 * - All leading and all trailing `"` chars are removed (matches `TRIM`).
 * - If the trimmed result would be empty, the original is preserved
 *   (so `""` and `"""` are left alone rather than blanked).
 * - Internal quotes are preserved (e.g. `Film "Noir" Style` is untouched).
 */
export function stripSurroundingQuotes(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '"') start++;
  while (end > start && value[end - 1] === '"') end--;
  if (start === 0 && end === value.length) return value;
  const trimmed = value.slice(start, end);
  return trimmed.length > 0 ? trimmed : value;
}
