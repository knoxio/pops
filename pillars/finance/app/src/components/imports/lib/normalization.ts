/**
 * Client-side normalization and matching helpers.
 *
 * Extracted from correction-proposal-shared.ts (tb-365).
 */

/** Client-side mirror of the server's normalizeDescription (corrections/types.ts).
 *  Uppercases, strips digits, collapses whitespace. Duplicated here to avoid
 *  pulling server code into the frontend bundle. */
export function normalizeForMatch(value: string): string {
  return value.toUpperCase().replaceAll(/\d+/g, '').replaceAll(/\s+/g, ' ').trim();
}

/**
 * Mirror the server matcher in `findMatchingCorrectionFromRules` / the
 * preview pipeline. Semantics:
 *  - For `exact`/`contains`: both sides are normalized via `normalizeForMatch`
 *    (patterns are stored already-normalized in the DB, but we normalize the
 *    client-side pattern too because the user can type a raw value in the
 *    detail editor before the server has a chance to normalize it).
 *  - For `regex`: pattern is kept raw (server stores regex patterns raw) and
 *    tested with `new RegExp(pattern)` — **no `i` flag** — against the
 *    *normalized* description. Using the `i` flag here, or testing against
 *    the raw description, would silently diverge from what the server preview
 *    engine matches and scope out transactions that actually hit on apply.
 */
export function transactionMatchesSignal(
  description: string,
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex'
): boolean {
  const normDesc = normalizeForMatch(description);
  if (matchType === 'regex') {
    if (pattern.length === 0) return false;
    try {
      return new RegExp(pattern).test(normDesc);
    } catch {
      return false;
    }
  }
  const normPattern = normalizeForMatch(pattern);
  if (!normPattern) return false;
  if (matchType === 'exact') return normDesc === normPattern;
  return normDesc.includes(normPattern);
}
