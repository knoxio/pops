/**
 * Tag vocabulary queries over `engram_tags`.
 *
 * Surfaces `listTags`, used by the ingest form's tag autocomplete. Returns
 * distinct tags ranked by usage count with optional prefix filtering for
 * typeahead.
 */
import { count, like } from 'drizzle-orm';

import { engramTags, type CerebrumDb } from '../../../db/index.js';

export interface TagInfo {
  tag: string;
  count: number;
}

/**
 * List all distinct tags with their engram counts. When `prefix` is provided,
 * only tags starting with that prefix are returned (case-insensitive).
 *
 * Results are ordered by count desc then tag asc so the most-used tags
 * surface first in typeahead suggestions.
 */
export function listTags(db: CerebrumDb, prefix?: string, limit = 100): TagInfo[] {
  const norm = prefix !== undefined && prefix.trim() !== '' ? prefix.trim().toLowerCase() : '';
  const baseQuery = db.select({ tag: engramTags.tag, total: count() }).from(engramTags).$dynamic();
  const filtered = norm ? baseQuery.where(like(engramTags.tag, `${norm}%`)) : baseQuery;
  const rows = filtered.groupBy(engramTags.tag).all();
  // Sort in memory because the `count()` alias requires dialect-specific
  // ordering syntax. Result set is bounded by the slice that follows so
  // memory cost is negligible.
  return rows
    .map((r) => ({ tag: r.tag, count: r.total }))
    .toSorted((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}
