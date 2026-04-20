import { createHash } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';

import { embeddings } from '@pops/db-types';

import { getDrizzle, getDb, isVecAvailable } from '../../../db.js';
import { embedContent } from '../../../jobs/embed-content.js';
import { getEmbeddingConfig, getEmbedding } from '../../../shared/embedding-client.js';
import { getRedis, isRedisAvailable, redisKey } from '../../../shared/redis-client.js';

import type { SearchResult, SearchOptions, EmbeddingStatus } from './types.js';

const QUERY_CACHE_TTL_SECONDS = 300; // 5 minutes

function vecUnavailableError(): Error {
  return Object.assign(new Error('Vector features unavailable: sqlite-vec extension not loaded'), {
    code: 'VEC_UNAVAILABLE',
  });
}

async function embedQueryWithCache(query: string): Promise<number[]> {
  const config = getEmbeddingConfig();
  const queryHash = createHash('sha256').update(query.trim()).digest('hex');
  const cacheKey = redisKey('query_vec', queryHash);

  const redis = getRedis();
  if (isRedisAvailable() && redis) {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as number[];
    const vector = await getEmbedding(query, config);
    await redis.set(cacheKey, JSON.stringify(vector), 'EX', QUERY_CACHE_TTL_SECONDS);
    return vector;
  }
  return getEmbedding(query, config);
}

interface VecRow {
  source_type: string;
  source_id: string;
  chunk_index: number;
  content_preview: string;
  distance: number;
}

function runKnnQuery(
  vectorBlob: Float32Array,
  limit: number,
  sourceTypes: string[] | undefined
): VecRow[] {
  let knnSql = `
    SELECT
      e.source_type,
      e.source_id,
      e.chunk_index,
      e.content_preview,
      ev.distance
    FROM embeddings_vec ev
    JOIN embeddings e ON e.id = ev.rowid
    WHERE ev.vector MATCH ?
      AND ev.k = ?
  `;
  const params: unknown[] = [vectorBlob, limit * 2];

  if (sourceTypes && sourceTypes.length > 0) {
    const placeholders = sourceTypes.map(() => '?').join(', ');
    knnSql += ` AND e.source_type IN (${placeholders})`;
    params.push(...sourceTypes);
  }

  knnSql += ' ORDER BY ev.distance';
  return getDb()
    .prepare(knnSql)
    .all(...params) as VecRow[];
}

/**
 * Embed a query string and run k-NN search against stored vectors.
 * Returns empty results immediately if the query is blank.
 */
export async function semanticSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  if (!isVecAvailable()) throw vecUnavailableError();

  const { sourceTypes, limit = 10, threshold = 1.0 } = options;
  const queryVector = await embedQueryWithCache(query);
  const rows = runKnnQuery(Float32Array.from(queryVector), limit, sourceTypes);

  return rows
    .filter((r) => r.distance <= threshold)
    .slice(0, limit)
    .map((r) => ({
      sourceType: r.source_type,
      sourceId: r.source_id,
      chunkIndex: r.chunk_index,
      contentPreview: r.content_preview,
      score: Math.max(0, 1 - r.distance),
      distance: r.distance,
    }));
}

/** Return embedding coverage stats for a source type (or all types). */
export function getEmbeddingStatus(sourceType?: string): EmbeddingStatus {
  const db = getDrizzle();
  const baseQuery = db.select({ count: sql<number>`count(*)` }).from(embeddings);
  const rows = sourceType
    ? baseQuery.where(eq(embeddings.sourceType, sourceType)).all()
    : baseQuery.all();

  const total = rows[0]?.count ?? 0;

  // Pending and stale counts require cross-table knowledge of source records.
  // Since embeddings covers multiple source types, we return 0 here as a safe
  // default — callers that track pending state should implement per-source queries.
  return { total, pending: 0, stale: 0 };
}

/**
 * Enqueue re-embedding jobs for given source records.
 * Returns the number of jobs enqueued.
 */
export async function reindexEmbeddings(sourceType: string, sourceIds?: string[]): Promise<number> {
  const db = getDrizzle();

  let ids: string[];
  if (sourceIds && sourceIds.length > 0) {
    ids = sourceIds;
  } else {
    // Re-index all records of this source type
    const rows = db
      .selectDistinct({ sourceId: embeddings.sourceId })
      .from(embeddings)
      .where(eq(embeddings.sourceType, sourceType))
      .all();
    ids = rows.map((r) => r.sourceId);
  }

  let enqueued = 0;
  for (const sourceId of ids) {
    const ok = await embedContent({ sourceType, sourceId });
    if (ok) enqueued++;
  }
  return enqueued;
}
