/**
 * StructuredQueryService — filters engram_index and junction tables using
 * parameterised SQL. Returns RetrievalResult[] with matchType: 'structured'.
 */
import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

import { engramIndex, engramScopes, engramTags } from '@pops/db-types';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalFilters, RetrievalResult } from './types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Check if a scope contains a secret segment. */
function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

export class StructuredQueryService {
  constructor(private readonly db: BetterSQLite3Database) {}

  query(filters: RetrievalFilters, limit = DEFAULT_LIMIT, offset = 0): RetrievalResult[] {
    const cappedLimit = Math.min(limit, MAX_LIMIT);

    // Build conditions list.
    const conditions = [ne(engramIndex.status, 'orphaned')];

    if (filters.status && filters.status.length > 0) {
      // If caller explicitly asks for orphaned, allow it.
      conditions.splice(0, 1); // remove the default exclusion
      conditions.push(inArray(engramIndex.status, filters.status));
    }

    if (filters.types && filters.types.length > 0) {
      conditions.push(inArray(engramIndex.type, filters.types));
    }

    if (filters.dateRange?.from) {
      conditions.push(gte(engramIndex.createdAt, filters.dateRange.from));
    }
    if (filters.dateRange?.to) {
      conditions.push(lte(engramIndex.createdAt, filters.dateRange.to));
    }

    // Custom field filter via json_extract.
    if (filters.customFields) {
      for (const [key, value] of Object.entries(filters.customFields)) {
        conditions.push(sql`json_extract(${engramIndex.customFields}, ${`$.${key}`}) = ${value}`);
      }
    }

    // Run main query.
    let rows = this.db
      .select()
      .from(engramIndex)
      .where(and(...conditions))
      .orderBy(desc(engramIndex.modifiedAt))
      .all();

    // Apply scope-based filtering in-memory (requires junction table).
    const scopeFilters = filters.scopes;
    if ((scopeFilters && scopeFilters.length > 0) || !filters.includeSecret) {
      rows = rows.filter((row) => {
        const scopes = this.db
          .select({ scope: engramScopes.scope })
          .from(engramScopes)
          .where(eq(engramScopes.engramId, row.id))
          .all()
          .map((s) => s.scope);

        if (!filters.includeSecret && scopes.some(isSecretScope)) return false;

        if (scopeFilters && scopeFilters.length > 0) {
          return scopes.some((s) => scopeFilters.some((f) => s === f || s.startsWith(f + '.')));
        }

        return true;
      });
    }

    // Apply tag AND-filter in-memory.
    const tagFilters = filters.tags;
    if (tagFilters && tagFilters.length > 0) {
      rows = rows.filter((row) => {
        const tags = this.db
          .select({ tag: engramTags.tag })
          .from(engramTags)
          .where(eq(engramTags.engramId, row.id))
          .all()
          .map((t) => t.tag);
        return tagFilters.every((required) => tags.includes(required));
      });
    }

    // Paginate and shape.
    const page = rows.slice(offset, offset + cappedLimit);

    return page.map((row) => {
      const scopes = this.db
        .select({ scope: engramScopes.scope })
        .from(engramScopes)
        .where(eq(engramScopes.engramId, row.id))
        .all()
        .map((s) => s.scope);

      const tags = this.db
        .select({ tag: engramTags.tag })
        .from(engramTags)
        .where(eq(engramTags.engramId, row.id))
        .all()
        .map((t) => t.tag);

      return {
        sourceType: 'engram',
        sourceId: row.id,
        title: row.title,
        contentPreview: '',
        score: 1,
        matchType: 'structured' as const,
        metadata: {
          type: row.type,
          source: row.source,
          status: row.status,
          scopes,
          tags,
          createdAt: row.createdAt,
          modifiedAt: row.modifiedAt,
          wordCount: row.wordCount,
          customFields: row.customFields,
        },
      };
    });
  }
}
