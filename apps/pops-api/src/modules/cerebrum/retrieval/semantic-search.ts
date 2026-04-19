/**
 * SemanticSearchService — wraps core semanticSearch with Thalamus metadata
 * resolution, scope filtering, and RetrievalResult shaping.
 */
import { eq } from 'drizzle-orm';

import {
  engramIndex,
  engramScopes,
  homeInventory,
  movies,
  transactions,
  tvShows,
} from '@pops/db-types';

import { getDb } from '../../../db.js';
import { isVecAvailable } from '../../../db.js';
import { getEmbedding, getEmbeddingConfig } from '../../../shared/embedding-client.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalFilters, RetrievalResult } from './types.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_THRESHOLD = 0.8;

function vecUnavailableError(): Error {
  return Object.assign(new Error('Vector features unavailable: sqlite-vec extension not loaded'), {
    code: 'VEC_UNAVAILABLE',
  });
}

/** Derive a human-readable title for a non-engram source row. */
function crossSourceTitle(sourceType: string, row: Record<string, unknown>): string {
  switch (sourceType) {
    case 'transaction':
      return (row['description'] as string | undefined) ?? 'Transaction';
    case 'movie':
      return (row['title'] as string | undefined) ?? 'Movie';
    case 'tv_show':
      return (row['name'] as string | undefined) ?? 'TV Show';
    case 'inventory':
      return (row['itemName'] as string | undefined) ?? 'Inventory item';
    default:
      return sourceType;
  }
}

/** Check if a scope contains a secret segment. */
function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

export class SemanticSearchService {
  constructor(private readonly db: BetterSQLite3Database) {}

  async search(
    query: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    threshold = DEFAULT_THRESHOLD
  ): Promise<RetrievalResult[]> {
    if (!query.trim()) {
      throw Object.assign(new Error('Query is required for semantic search'), {
        code: 'EMPTY_QUERY',
      });
    }
    if (!isVecAvailable()) throw vecUnavailableError();

    const config = getEmbeddingConfig();
    const queryVector = await getEmbedding(query, config);
    const vectorBlob = Float32Array.from(queryVector);

    // Fetch more candidates than requested so we can filter and still hit the limit.
    const fetchLimit = limit * 3;

    const rawDb = getDb();
    const rows = rawDb
      .prepare(
        `
        SELECT
          e.source_type,
          e.source_id,
          e.chunk_index,
          e.content_preview,
          e.content_hash,
          ev.distance
        FROM embeddings_vec ev
        JOIN embeddings e ON e.id = ev.rowid
        WHERE ev.vector MATCH ?
          AND ev.k = ?
        ORDER BY ev.distance
      `
      )
      .all(vectorBlob, fetchLimit) as {
      source_type: string;
      source_id: string;
      chunk_index: number;
      content_preview: string;
      content_hash: string;
      distance: number;
    }[];

    // Apply distance threshold.
    const candidates = rows.filter((r) => r.distance <= threshold);

    // Resolve metadata and apply filters, deduplicating by sourceId (keep best chunk).
    const seen = new Map<string, (typeof candidates)[number]>();
    for (const row of candidates) {
      const key = `${row.source_type}:${row.source_id}`;
      if (!seen.has(key)) seen.set(key, row);
    }

    const results: RetrievalResult[] = [];

    for (const [, row] of seen) {
      if (filters.sourceTypes && !filters.sourceTypes.includes(row.source_type)) continue;

      const metadata = await this.resolveMetadata(row.source_type, row.source_id, filters);
      if (!metadata) continue; // orphaned or filtered out

      results.push({
        sourceType: row.source_type,
        sourceId: row.source_id,
        title: metadata.title,
        contentPreview: row.content_preview.slice(0, 200),
        score: Math.max(0, 1 - row.distance),
        distance: row.distance,
        matchType: 'semantic',
        metadata: metadata.fields,
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Run a k-NN search using an existing vector (by embeddings.id = rowid).
   * Used by the `similar` endpoint — no embedding API call needed.
   */
  async searchByVector(
    vectorBlob: Float32Array,
    sourceIdToExclude: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    threshold = DEFAULT_THRESHOLD
  ): Promise<RetrievalResult[]> {
    if (!isVecAvailable()) throw vecUnavailableError();

    const rawDb = getDb();
    const fetchLimit = limit * 3;

    const rows = rawDb
      .prepare(
        `
        SELECT
          e.source_type,
          e.source_id,
          e.chunk_index,
          e.content_preview,
          e.content_hash,
          ev.distance
        FROM embeddings_vec ev
        JOIN embeddings e ON e.id = ev.rowid
        WHERE ev.vector MATCH ?
          AND ev.k = ?
        ORDER BY ev.distance
      `
      )
      .all(vectorBlob, fetchLimit) as {
      source_type: string;
      source_id: string;
      chunk_index: number;
      content_preview: string;
      content_hash: string;
      distance: number;
    }[];

    const candidates = rows.filter(
      (r) => r.distance <= threshold && r.source_id !== sourceIdToExclude
    );

    const seen = new Map<string, (typeof candidates)[number]>();
    for (const row of candidates) {
      const key = `${row.source_type}:${row.source_id}`;
      if (!seen.has(key)) seen.set(key, row);
    }

    const results: RetrievalResult[] = [];
    for (const [, row] of seen) {
      if (filters.sourceTypes && !filters.sourceTypes.includes(row.source_type)) continue;
      const metadata = await this.resolveMetadata(row.source_type, row.source_id, filters);
      if (!metadata) continue;

      results.push({
        sourceType: row.source_type,
        sourceId: row.source_id,
        title: metadata.title,
        contentPreview: row.content_preview.slice(0, 200),
        score: Math.max(0, 1 - row.distance),
        distance: row.distance,
        matchType: 'semantic',
        metadata: metadata.fields,
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  /** Retrieve the embedding vector blob for an engram by its source ID. */
  getVectorForEngram(engramId: string): Float32Array | null {
    const rawDb = getDb();
    const row = rawDb
      .prepare(
        `
        SELECT ev.vector
        FROM embeddings_vec ev
        JOIN embeddings e ON e.id = ev.rowid
        WHERE e.source_type = 'engram' AND e.source_id = ?
        ORDER BY e.chunk_index
        LIMIT 1
      `
      )
      .get(engramId) as { vector: Buffer } | undefined;

    if (!row) return null;
    return new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
  }

  private async resolveMetadata(
    sourceType: string,
    sourceId: string,
    filters: RetrievalFilters
  ): Promise<{ title: string; fields: Record<string, unknown> } | null> {
    if (sourceType === 'engram') {
      const rows = this.db.select().from(engramIndex).where(eq(engramIndex.id, sourceId)).all();
      const row = rows[0];
      if (!row || row.status === 'orphaned') return null;

      // Apply scope filter and secret exclusion.
      const scopes = this.db
        .select({ scope: engramScopes.scope })
        .from(engramScopes)
        .where(eq(engramScopes.engramId, sourceId))
        .all()
        .map((s) => s.scope);

      if (!filters.includeSecret && scopes.some(isSecretScope)) return null;

      if (filters.scopes && filters.scopes.length > 0) {
        const scopeFilters = filters.scopes;
        const matchesScope = scopes.some((s) =>
          scopeFilters.some((f) => s === f || s.startsWith(f + '.'))
        );
        if (!matchesScope) return null;
      }

      return {
        title: row.title,
        fields: {
          type: row.type,
          source: row.source,
          status: row.status,
          scopes,
          createdAt: row.createdAt,
          modifiedAt: row.modifiedAt,
          wordCount: row.wordCount,
        },
      };
    }

    // Cross-source domain rows — scope filter does not apply.
    const domainRow = this.fetchDomainRow(sourceType, sourceId);
    if (!domainRow) return null;

    const title = crossSourceTitle(sourceType, domainRow);
    return { title, fields: domainRow };
  }

  private fetchDomainRow(sourceType: string, sourceId: string): Record<string, unknown> | null {
    switch (sourceType) {
      case 'transaction': {
        const rows = this.db.select().from(transactions).where(eq(transactions.id, sourceId)).all();
        return (rows[0] as Record<string, unknown> | undefined) ?? null;
      }
      case 'movie': {
        const rows = this.db
          .select()
          .from(movies)
          .where(eq(movies.id, Number(sourceId)))
          .all();
        return (rows[0] as Record<string, unknown> | undefined) ?? null;
      }
      case 'tv_show': {
        const rows = this.db
          .select()
          .from(tvShows)
          .where(eq(tvShows.id, Number(sourceId)))
          .all();
        return (rows[0] as Record<string, unknown> | undefined) ?? null;
      }
      case 'inventory': {
        const rows = this.db
          .select()
          .from(homeInventory)
          .where(eq(homeInventory.id, sourceId))
          .all();
        return (rows[0] as Record<string, unknown> | undefined) ?? null;
      }
      default:
        return null;
    }
  }
}
