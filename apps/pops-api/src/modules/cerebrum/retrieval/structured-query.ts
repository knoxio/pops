/**
 * StructuredQueryService — filters engram_index and junction tables using
 * parameterised SQL. Returns RetrievalResult[] with matchType: 'structured'.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';

import { embeddings, engramIndex, engramScopes, engramTags } from '@pops/db-types';

import { buildStructuredConditions } from './structured-query-conditions.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalFilters, RetrievalResult } from './types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface JunctionMaps {
  scopesByEngramId: Map<string, string[]>;
  tagsByEngramId: Map<string, string[]>;
  previewByEngramId: Map<string, string>;
}

function bucketByEngram<TKey extends string>(
  rows: { engramId: string }[] & { engramId: string; [k: string]: unknown }[],
  valueKey: TKey
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const value = (row as Record<string, unknown>)[valueKey] as string;
    const arr = map.get(row.engramId);
    if (arr) arr.push(value);
    else map.set(row.engramId, [value]);
  }
  return map;
}

export class StructuredQueryService {
  constructor(private readonly db: BetterSQLite3Database) {}

  query(filters: RetrievalFilters, limit = DEFAULT_LIMIT, offset = 0): RetrievalResult[] {
    if (filters.sourceTypes && !filters.sourceTypes.includes('engram')) return [];

    const cappedLimit = Math.min(limit, MAX_LIMIT);
    const conditions = buildStructuredConditions(filters);

    const rows = this.db
      .select()
      .from(engramIndex)
      .where(and(...conditions))
      .orderBy(desc(engramIndex.modifiedAt))
      .limit(cappedLimit)
      .offset(offset)
      .all();

    if (rows.length === 0) return [];

    const maps = this.fetchJunctionData(rows.map((r) => r.id));
    return rows.map((row) => this.toRetrievalResult(row, maps));
  }

  private fetchJunctionData(rowIds: string[]): JunctionMaps {
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

    const previewByEngramId = new Map<string, string>();
    for (const { sourceId, contentPreview } of previewRows) {
      previewByEngramId.set(sourceId, contentPreview);
    }

    return {
      scopesByEngramId: bucketByEngram(scopeRows as never[], 'scope'),
      tagsByEngramId: bucketByEngram(tagRows as never[], 'tag'),
      previewByEngramId,
    };
  }

  private toRetrievalResult(
    row: typeof engramIndex.$inferSelect,
    maps: JunctionMaps
  ): RetrievalResult {
    return {
      sourceType: 'engram',
      sourceId: row.id,
      title: row.title,
      contentPreview: maps.previewByEngramId.get(row.id) ?? '',
      score: 1,
      matchType: 'structured' as const,
      metadata: {
        type: row.type,
        source: row.source,
        status: row.status,
        scopes: maps.scopesByEngramId.get(row.id) ?? [],
        tags: maps.tagsByEngramId.get(row.id) ?? [],
        createdAt: row.createdAt,
        modifiedAt: row.modifiedAt,
        wordCount: row.wordCount,
        customFields: row.customFields,
        contentHash: row.contentHash,
      },
    };
  }
}
