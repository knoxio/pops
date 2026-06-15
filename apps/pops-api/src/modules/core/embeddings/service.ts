import { createHash } from 'node:crypto';

import {
  EmbeddingsGetStatusOutputSchema,
  EmbeddingsListSourceIdsByTypeOutputSchema,
} from '@pops/cerebrum-contract/schemas';
import { pillar } from '@pops/pillar-sdk/server';

import { getDb, isVecAvailable } from '../../../db.js';
import { embedContent } from '../../../jobs/embed-content.js';
import { logger } from '../../../lib/logger.js';
import { getEmbeddingConfig, getEmbedding } from '../../../shared/embedding-client.js';
import { getRedis, isRedisAvailable, redisKey } from '../../../shared/redis-client.js';

import type { SearchResult, SearchOptions, EmbeddingStatus } from './types.js';

/**
 * Local shape for the cross-pillar `cerebrum.embeddings.*` SDK surface
 * (PRD-249). Mirrors `apps/pops-mcp/src/tools/inventory-connections.ts`'s
 * pattern: until `@pops/cerebrum-contract/router`'s `CerebrumRouter`
 * carries the concrete per-procedure types (blocked on PRD-155's
 * declaration bundler), the typed-proxy needs a structural router shape
 * to resolve the `pillar('cerebrum').embeddings.*` paths. The shape
 * here is structural-only — the wire contract is the zod schema parsed
 * on the result.
 */
type CerebrumEmbeddingsShape = {
  embeddings: {
    getStatus: (input: { sourceType?: string }) => unknown;
    listSourceIdsByType: (input: { sourceType: string }) => unknown;
  };
};

const QUERY_CACHE_TTL_SECONDS = 300; // 5 minutes

function vecUnavailableError(): Error {
  return Object.assign(new Error('Vector features unavailable: sqlite-vec extension not loaded'), {
    code: 'VEC_UNAVAILABLE',
  });
}

async function embedQueryWithCache(query: string): Promise<number[] | null> {
  const config = getEmbeddingConfig();
  const queryHash = createHash('sha256').update(query.trim()).digest('hex');
  const cacheKey = redisKey('query_vec', queryHash);

  const redis = getRedis();
  try {
    if (isRedisAvailable() && redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as number[];
      const vector = await getEmbedding(query, config, { inputType: 'query' });
      await redis.set(cacheKey, JSON.stringify(vector), 'EX', QUERY_CACHE_TTL_SECONDS);
      return vector;
    }
    return await getEmbedding(query, config, { inputType: 'query' });
  } catch (err) {
    // A provider error must not crash the API. Degrade to "no semantic results".
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), provider: config.provider },
      '[Embeddings] embedQueryWithCache failed; returning no semantic results'
    );
    return null;
  }
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
  if (!queryVector) return [];
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

/**
 * Return embedding coverage stats for a source type (or all types).
 *
 * Reads via the cross-pillar `cerebrum.embeddings.getStatus` SDK surface
 * (PRD-249) — the cerebrum-internal embedding worker owns the underlying
 * `embeddings` table; this core-side caller no longer touches
 * `@pops/cerebrum-db` at runtime. `PillarCallError` propagates so the
 * caller surfaces an unavailable-pillar signal rather than silently
 * masking it.
 *
 * The response is parsed through the contract's output schema so the
 * `unknown` shape returned by the typed-proxy's `.orThrow()` (a
 * consequence of `CerebrumRouter` being `AnyTRPCRouter` until PRD-155
 * lands the declaration bundler) is narrowed without `as` casts.
 */
export async function getEmbeddingStatus(sourceType?: string): Promise<EmbeddingStatus> {
  const input = sourceType === undefined ? {} : { sourceType };
  const raw = await pillar<CerebrumEmbeddingsShape>('cerebrum').embeddings.getStatus.orThrow(input);
  return EmbeddingsGetStatusOutputSchema.parse(raw);
}

/**
 * Enqueue re-embedding jobs for given source records.
 * Returns the number of jobs enqueued.
 *
 * The "list all source ids for this type" branch goes through the
 * `cerebrum.embeddings.listSourceIdsByType` SDK surface (PRD-249); the
 * per-id `embedContent({ sourceType, sourceId })` enqueue stays
 * in-pillar (it's a worker enqueue, not a cerebrum-db read).
 */
export async function reindexEmbeddings(sourceType: string, sourceIds?: string[]): Promise<number> {
  let ids: readonly string[];
  if (sourceIds && sourceIds.length > 0) {
    ids = sourceIds;
  } else {
    const raw = await pillar<CerebrumEmbeddingsShape>(
      'cerebrum'
    ).embeddings.listSourceIdsByType.orThrow({
      sourceType,
    });
    ids = EmbeddingsListSourceIdsByTypeOutputSchema.parse(raw).sourceIds;
  }

  let enqueued = 0;
  for (const sourceId of ids) {
    const ok = await embedContent({ sourceType, sourceId });
    if (ok) enqueued++;
  }
  return enqueued;
}
