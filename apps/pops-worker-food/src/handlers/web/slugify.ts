/**
 * PRD-127 — slugify a human string into the DSL-grammar slug shape:
 *
 *   - Starts with `[a-z]`.
 *   - Continues with `[a-z0-9-]`.
 *
 * Strategy: lowercase + NFKD-normalize to strip diacritics, replace any
 * remaining non `[a-z0-9]` runs with a single hyphen, trim leading/trailing
 * hyphens, ensure it starts with a letter (prepend `r-` if it starts with
 * a digit), and fall back to `recipe` for the empty case.
 */
export function slugify(input: string): string {
  const lower = input.toLowerCase();
  const stripped = lower.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const ascii = stripped.replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  let collapsed = ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (collapsed === '') collapsed = 'recipe';
  if (/^[0-9]/.test(collapsed)) collapsed = `r-${collapsed}`;
  return collapsed;
}

/**
 * Disambiguate `slug` against `existing`. Returns `slug` if free; else
 * appends `-2`, `-3`, ... until a free name is found.
 */
export function disambiguateSlug(slug: string, existing: ReadonlySet<string>): string {
  if (!existing.has(slug)) return slug;
  let n = 2;
  while (existing.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}
