/**
 * Parse the `pages` query param for context picks.
 *
 * Over tRPC the monolith accepted a `Record<string, number>` directly. Over
 * REST the load-more page map arrives as a JSON-encoded query string; this
 * decodes it defensively (only `collectionId → positive int` entries survive)
 * and returns undefined when absent or malformed, so a bad client value can
 * never crash the handler — it just falls back to page 1.
 */
export function parseContextPages(raw: string | undefined): Record<string, number> | undefined {
  if (raw === undefined || raw === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;

  const pages: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      pages[key] = value;
    }
  }
  return Object.keys(pages).length > 0 ? pages : undefined;
}
