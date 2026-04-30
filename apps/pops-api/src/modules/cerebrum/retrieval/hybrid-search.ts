import { logger } from '../../../lib/logger.js';
import { getSettingValue } from '../../core/settings/service.js';
import { SemanticSearchService } from './semantic-search.js';
import { StructuredQueryService } from './structured-query.js';

/**
 * HybridSearchService — orchestrates SemanticSearchService and
 * StructuredQueryService, merges results with reciprocal rank fusion (RRF),
 * and routes the unified `search` procedure.
 *
 * RRF formula: score = sum(1 / (k + rank_i)) where k = 60.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalFilters, RetrievalResult } from './types.js';

function getHybridRrfK(): number {
  return getSettingValue('cerebrum.hybrid.rrfK', 60);
}

function getHybridDefaultLimit(): number {
  return getSettingValue('cerebrum.hybrid.defaultLimit', 20);
}

function getHybridDefaultThreshold(): number {
  return getSettingValue('cerebrum.hybrid.defaultThreshold', 0.8);
}

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

/** Apply RRF to merge two ranked lists. Returns merged list sorted by descending score. */
function reciprocalRankFusion(
  semanticResults: RetrievalResult[],
  structuredResults: RetrievalResult[],
  limit: number
): RetrievalResult[] {
  const rrfK = getHybridRrfK();
  const scores = new Map<string, { score: number; result: RetrievalResult; inBoth: boolean }>();

  for (const [i, r] of semanticResults.entries()) {
    const key = `${r.sourceType}:${r.sourceId}`;
    const contribution = 1 / (rrfK + i + 1);
    const existing = scores.get(key);
    if (existing) {
      existing.score += contribution;
      existing.inBoth = true;
    } else {
      scores.set(key, { score: contribution, result: r, inBoth: false });
    }
  }

  for (const [i, r] of structuredResults.entries()) {
    const key = `${r.sourceType}:${r.sourceId}`;
    const contribution = 1 / (rrfK + i + 1);
    const existing = scores.get(key);
    if (existing) {
      existing.score += contribution;
      existing.inBoth = true;
      // Merge metadata from structured result (richer for engrams).
      existing.result = {
        ...existing.result,
        metadata: { ...existing.result.metadata, ...r.metadata },
      };
    } else {
      scores.set(key, { score: contribution, result: r, inBoth: false });
    }
  }

  return [...scores.values()]
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, result, inBoth }) => ({
      ...result,
      score,
      matchType: inBoth ? ('both' as const) : result.matchType,
    }));
}

export class HybridSearchService {
  private readonly semanticSvc: SemanticSearchService;
  private readonly structuredSvc: StructuredQueryService;

  constructor(db: BetterSQLite3Database) {
    this.semanticSvc = new SemanticSearchService(db);
    this.structuredSvc = new StructuredQueryService(db);
  }

  /** Run hybrid search: both semantic + structured, merged with RRF. */
  async hybrid(
    query: string,
    filters: RetrievalFilters = {},
    limit = getHybridDefaultLimit(),
    threshold = getHybridDefaultThreshold()
  ): Promise<RetrievalResult[]> {
    const fetchLimit = limit * 3;

    // Pass `limit` (not fetchLimit) to semantic search — it over-fetches 3x internally.
    // Structured query gets fetchLimit since it doesn't over-fetch.
    //
    // Semantic search is best-effort: an embedding-API failure (network,
    // Voyage 400, rate-limit) must not break hybrid retrieval, since the
    // structured (BM25) leg is independent and still useful. Falling back to
    // BM25-only mirrors the existing graceful-degrade path for the
    // `isEmbeddingConfigured()` check inside SemanticSearchService.search and
    // the `Thalamus retrieval failed` catch upstream in the chat engine
    // (#2439).
    const [semanticResults, structuredResults] = await Promise.all([
      this.semanticSvc.search(query, filters, limit, threshold).catch((error: unknown) => {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          '[HybridSearch] Semantic search failed — falling back to BM25-only'
        );
        return [] as RetrievalResult[];
      }),
      this.structuredSvc.query(filters, fetchLimit),
    ]);

    const merged = reciprocalRankFusion(semanticResults, structuredResults, limit);

    // Final secret-scope exclusion pass on merged set.
    if (!filters.includeSecret) {
      return merged.filter((r) => {
        const scopes = (r.metadata['scopes'] as string[] | undefined) ?? [];
        return !scopes.some(isSecretScope);
      });
    }

    return merged;
  }

  /** Semantic-only search. */
  async semanticSearch(
    query: string,
    filters: RetrievalFilters = {},
    limit = getHybridDefaultLimit(),
    threshold = getHybridDefaultThreshold()
  ): Promise<RetrievalResult[]> {
    return this.semanticSvc.search(query, filters, limit, threshold);
  }

  /** Structured-only search. */
  structuredOnly(
    filters: RetrievalFilters,
    limit = getHybridDefaultLimit(),
    offset = 0
  ): RetrievalResult[] {
    return this.structuredSvc.query(filters, limit, offset);
  }

  /**
   * Find engrams similar to the given engram by its existing embedding vector.
   * No embedding API call — reads the vector directly from embeddings_vec.
   */
  async similar(
    engramId: string,
    filters: RetrievalFilters = {},
    limit = getHybridDefaultLimit(),
    threshold = getHybridDefaultThreshold()
  ): Promise<RetrievalResult[]> {
    const vector = this.semanticSvc.getVectorForEngram(engramId);
    if (!vector) {
      return [];
    }
    return this.semanticSvc.searchByVector({
      vectorBlob: vector,
      sourceIdToExclude: engramId,
      filters,
      limit,
      threshold,
    });
  }
}
