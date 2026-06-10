/**
 * PRD-138 — shared helpers for the `food.inbox.list*` queries.
 *
 *   - Cursor encoding: opaque base64 of `<isoTimestamp>|<id>`. Ordering-stable;
 *     the timestamp drives the ORDER BY and the id breaks ties. Malformed
 *     cursors decode to `null` (the caller treats this as "first page")
 *     rather than throwing, so a client refresh on a stale cursor never
 *     surfaces an opaque server error.
 *
 *   - `sinceCutoffIso`: maps the inbox's `sinceDays` filter (7/30/90/null)
 *     to an absolute ISO timestamp the SQL `>=` predicate can use directly.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function sinceCutoffIso(sinceDays: 7 | 30 | 90 | null): string | null {
  if (sinceDays === null) return null;
  return new Date(Date.now() - sinceDays * MS_PER_DAY).toISOString();
}

export function encodeCursor(timestamp: string, id: number): string {
  return Buffer.from(`${timestamp}|${id}`, 'utf8').toString('base64');
}

export function decodeCursor(cursor: string | undefined): { ts: string; id: number } | null {
  if (cursor === undefined) return null;
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const sep = raw.indexOf('|');
    if (sep < 0) return null;
    const ts = raw.slice(0, sep);
    const id = Number(raw.slice(sep + 1));
    if (!Number.isFinite(id) || ts.length === 0) return null;
    return { ts, id };
  } catch {
    return null;
  }
}
