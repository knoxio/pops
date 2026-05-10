/**
 * tRPC router for cerebrum.tags.
 *
 * Surfaces a single `list` procedure used by the ingest form (PRD-081 US-01)
 * to power tag autocomplete. Returns distinct tags ranked by usage count
 * with optional prefix filtering for typeahead.
 */
import { count, like } from 'drizzle-orm';
import { z } from 'zod';

import { engramTags } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export interface TagInfo {
  tag: string;
  count: number;
}

/** Validate prefix input — typeahead only sends short alpha tokens. */
const TAG_PREFIX = /^[a-z0-9][a-z0-9-_:.]{0,63}$/i;
const tagPrefixSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(TAG_PREFIX, 'invalid tag prefix format')
  .transform((v) => v.toLowerCase());

/**
 * List all distinct tags with their engram counts. When `prefix` is provided,
 * only tags starting with that prefix are returned (case-insensitive).
 *
 * Results are ordered by count desc then tag asc so the most-used tags
 * surface first in typeahead suggestions.
 */
export function listTags(db: BetterSQLite3Database, prefix?: string, limit = 100): TagInfo[] {
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

export const tagsRouter = router({
  /**
   * List known tags ranked by usage count, optionally filtered by prefix.
   * Used by the ingest form's tag autocomplete.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          prefix: tagPrefixSchema.optional(),
          limit: z.number().int().positive().max(500).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return { tags: listTags(getDrizzle(), input?.prefix, input?.limit) };
    }),
});
