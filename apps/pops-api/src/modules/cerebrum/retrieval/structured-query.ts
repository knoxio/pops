/**
 * StructuredQueryService — filters engram_index and junction tables using
 * parameterised SQL. Returns RetrievalResult[] with matchType: 'structured'.
 *
 * Scope/tag/secret filtering is pushed into SQL (EXISTS/COUNT subqueries).
 * Pagination is SQL-side. Junction tables and embeddings are batch-prefetched
 * for the result page to avoid N+1 queries.
 */
import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

import { embeddings, engramIndex, engramScopes, engramTags } from '@pops/db-types';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalFilters, RetrievalResult } from './types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class StructuredQueryService {
  constructor(private readonly db: BetterSQLite3Database) {}

  query(filters: RetrievalFilters, limit = DEFAULT_LIMIT, offset = 0): RetrievalResult[] {
    // Structured search only ever returns engrams — skip if caller excluded them.
    if (filters.sourceTypes && !filters.sourceTypes.includes('engram')) return [];

    const cappedLimit = Math.min(limit, MAX_LIMIT);
    const conditions = [ne(engramIndex.status, 'orphaned')];

    if (filters.status && filters.status.length > 0) {
      // Caller explicitly requests certain statuses — replace default orphan exclusion.
      conditions.splice(0, 1);
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

    if (filters.customFields) {
      for (const [key, value] of Object.entries(filters.customFields)) {
        conditions.push(sql`json_extract(${engramIndex.customFields}, ${`$.${key}`}) = ${value}`);
      }
    }

    // Secret-scope exclusion via NOT EXISTS — no in-memory pass needed.
    if (!filters.includeSecret) {
      conditions.push(sql`not exists (
        select 1 from ${engramScopes}
        where ${engramScopes.engramId} = ${engramIndex.id}
          and (
            ${engramScopes.scope} = 'secret'
            or ${engramScopes.scope} like '%.secret.%'
            or ${engramScopes.scope} like 'secret.%'
            or ${engramScopes.scope} like '%.secret'
          )
      )`);
    }

    // Scope prefix filter via EXISTS — any matching scope passes.
    const scopeFilters = filters.scopes;
    if (scopeFilters && scopeFilters.length > 0) {
      const scopePredicates = scopeFilters.map((f) => {
        const prefix = `${f}.%`;
        return sql`(${engramScopes.scope} = ${f} or ${engramScopes.scope} like ${prefix})`;
      });
      conditions.push(sql`exists (
        select 1 from ${engramScopes}
        where ${engramScopes.engramId} = ${engramIndex.id}
          and (${sql.join(scopePredicates, sql` or `)})
      )`);
    }

    // Tag AND-filter via COUNT subquery — all required tags must be present.
    const tagFilters = filters.tags ? [...new Set(filters.tags)] : undefined;
    if (tagFilters && tagFilters.length > 0) {
      const tagParams = tagFilters.map((t) => sql`${t}`);
      conditions.push(sql`(
        select count(distinct ${engramTags.tag})
        from ${engramTags}
        where ${engramTags.engramId} = ${engramIndex.id}
          and ${engramTags.tag} in (${sql.join(tagParams, sql`, `)})
      ) = ${tagFilters.length}`);
    }

    // SQL-side pagination — no full table scan.
    const rows = this.db
      .select()
      .from(engramIndex)
      .where(and(...conditions))
      .orderBy(desc(engramIndex.modifiedAt))
      .limit(cappedLimit)
      .offset(offset)
      .all();

    if (rows.length === 0) return [];

    // Batch-prefetch junction tables and embedding previews for the page.
    const rowIds = rows.map((r) => r.id);

    const scopeRows = this.db
      .select({ engramId: engramScopes.engramId, scope: engramScopes.scope })
      .from(engramScopes)
      .where(inArray(engramScopes.engramId, rowIds))
      .all();

    const tagRows = this.db
      .select({ engramId: engramTags.engramId, tag: engramTags.tag })
      .from(engramTags)
      .where(inArray(engramTags.engramId, rowIds))
      .all();

    const previewRows = this.db
      .select({ sourceId: embeddings.sourceId, contentPreview: embeddings.contentPreview })
      .from(embeddings)
      .where(
        and(
          eq(embeddings.sourceType, 'engram'),
          inArray(embeddings.sourceId, rowIds),
          eq(embeddings.chunkIndex, 0)
        )
      )
      .all();

    // Build lookup maps from batch results.
    const scopesByEngramId = new Map<string, string[]>();
    for (const { engramId, scope } of scopeRows) {
      const arr = scopesByEngramId.get(engramId);
      if (arr) arr.push(scope);
      else scopesByEngramId.set(engramId, [scope]);
    }

    const tagsByEngramId = new Map<string, string[]>();
    for (const { engramId, tag } of tagRows) {
      const arr = tagsByEngramId.get(engramId);
      if (arr) arr.push(tag);
      else tagsByEngramId.set(engramId, [tag]);
    }

    const previewByEngramId = new Map<string, string>();
    for (const { sourceId, contentPreview } of previewRows) {
      previewByEngramId.set(sourceId, contentPreview);
    }

    return rows.map((row) => ({
      sourceType: 'engram',
      sourceId: row.id,
      title: row.title,
      contentPreview: previewByEngramId.get(row.id) ?? '',
      score: 1,
      matchType: 'structured' as const,
      metadata: {
        type: row.type,
        source: row.source,
        status: row.status,
        scopes: scopesByEngramId.get(row.id) ?? [],
        tags: tagsByEngramId.get(row.id) ?? [],
        createdAt: row.createdAt,
        modifiedAt: row.modifiedAt,
        wordCount: row.wordCount,
        customFields: row.customFields,
        contentHash: row.contentHash,
      },
    }));
  }
}
