/**
 * SemanticSearchService — wraps core semanticSearch with Thalamus metadata
 * resolution, scope/type/status filtering, and RetrievalResult shaping.
 */
import { createHash } from 'node:crypto';

import { getDb, isVecAvailable } from '../../../db.js';
import { getEmbedding, getEmbeddingConfig } from '../../../shared/embedding-client.js';
import { getRedis, isRedisAvailable, redisKey } from '../../../shared/redis-client.js';
import { getSettingValue } from '../../core/settings/service.js';
import {
  collectResults,
  dedupeBySource,
  knnQuery,
  vecUnavailableError,
} from './semantic-search-helpers.js';
import { resolveMetadata } from './semantic-search-metadata.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalFilters, RetrievalResult } from './types.js';

function getSemanticDefaultLimit(): number {
  return getSettingValue('cerebrum.semantic.defaultLimit', 20);
}

function getSemanticDefaultThreshold(): number {
  return getSettingValue('cerebrum.semantic.defaultThreshold', 0.8);
}

function getSemanticQueryCacheTtl(): number {
  return getSettingValue('cerebrum.semantic.queryCacheTtl', 300);
}

export interface SearchByVectorOptions {
  vectorBlob: Float32Array;
  sourceIdToExclude: string;
  filters?: RetrievalFilters;
  limit?: number;
  threshold?: number;
}

async function embedQuery(query: string): Promise<number[]> {
  const config = getEmbeddingConfig();
  const queryHash = createHash('sha256').update(query.trim()).digest('hex');
  const cacheKey = redisKey('query_vec', queryHash);

  const redis = getRedis();
  if (isRedisAvailable() && redis) {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as number[];
    const vector = await getEmbedding(query, config);
    await redis.set(cacheKey, JSON.stringify(vector), 'EX', getSemanticQueryCacheTtl());
    return vector;
  }

  return getEmbedding(query, config);
}

export class SemanticSearchService {
  constructor(private readonly db: BetterSQLite3Database) {}

  async search(
    query: string,
    filters: RetrievalFilters = {},
    limit = getSemanticDefaultLimit(),
    threshold = getSemanticDefaultThreshold()
  ): Promise<RetrievalResult[]> {
    if (!query.trim()) {
      throw Object.assign(new Error('Query is required for semantic search'), {
        code: 'EMPTY_QUERY',
      });
    }
    if (!isVecAvailable()) throw vecUnavailableError();

    const queryVector = await embedQuery(query);
    const vectorBlob = Float32Array.from(queryVector);
    const rows = knnQuery(vectorBlob, limit * 3).filter((r) => r.distance <= threshold);
    const seen = dedupeBySource(rows);

    return collectResults({
      rows: seen.values(),
      filters,
      limit,
      resolveMetadata: (st, sid, f) => resolveMetadata(this.db, st, sid, f),
    });
  }

  /**
   * Run a k-NN search using an existing vector blob (read from embeddings_vec).
   * Used by the `similar` endpoint — no embedding API call needed.
   */
  async searchByVector(opts: SearchByVectorOptions): Promise<RetrievalResult[]> {
    if (!isVecAvailable()) throw vecUnavailableError();
    const limit = opts.limit ?? getSemanticDefaultLimit();
    const threshold = opts.threshold ?? getSemanticDefaultThreshold();
    const filters = opts.filters ?? {};

    const rows = knnQuery(opts.vectorBlob, limit * 3).filter(
      (r) => r.distance <= threshold && r.source_id !== opts.sourceIdToExclude
    );
    const seen = dedupeBySource(rows);

    return collectResults({
      rows: seen.values(),
      filters,
      limit,
      resolveMetadata: (st, sid, f) => resolveMetadata(this.db, st, sid, f),
    });
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
}
