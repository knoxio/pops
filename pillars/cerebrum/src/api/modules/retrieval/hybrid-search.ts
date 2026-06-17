/**
 * HybridSearchService — orchestrates {@link SemanticSearchService} and
 * {@link StructuredQueryService}, merges with reciprocal rank fusion (RRF,
 * k=60), and backs the `search` / `context` / `similar` handlers.
 *
 * Graceful degradation: the semantic leg is best-effort. A missing embedding
 * client, a vec-unavailable database, or a provider error all collapse the
 * semantic leg to an empty list (logged), so hybrid retrieval falls back to
 * the BM25 (structured) leg, which is independent. This mirrors the monolith's
 * `Thalamus retrieval failed` fallback.
 */
import { SemanticSearchService, type SemanticSearchDeps } from './semantic-search.js';
import { StructuredQueryService } from './structured-query.js';

import type { RetrievalFilters, RetrievalResult } from './types.js';

const RRF_K = 60;
const DEFAULT_LIMIT = 20;
const DEFAULT_THRESHOLD = 0.8;

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

/** Apply RRF to merge two ranked lists. Returns merged list sorted by descending score. */
function reciprocalRankFusion(
  semanticResults: RetrievalResult[],
  structuredResults: RetrievalResult[],
  limit: number
): RetrievalResult[] {
  const scores = new Map<string, { score: number; result: RetrievalResult; inBoth: boolean }>();

  for (const [i, r] of semanticResults.entries()) {
    const key = `${r.sourceType}:${r.sourceId}`;
    const contribution = 1 / (RRF_K + i + 1);
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
    const contribution = 1 / (RRF_K + i + 1);
    const existing = scores.get(key);
    if (existing) {
      existing.score += contribution;
      existing.inBoth = true;
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

  constructor(deps: SemanticSearchDeps) {
    this.semanticSvc = new SemanticSearchService(deps);
    this.structuredSvc = new StructuredQueryService(deps.db);
  }

  async hybrid(
    query: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    threshold = DEFAULT_THRESHOLD
  ): Promise<RetrievalResult[]> {
    const fetchLimit = limit * 3;

    const [semanticResults, structuredResults] = await Promise.all([
      this.semanticSvc.search(query, filters, limit, threshold).catch((error: unknown) => {
        console.warn(
          `[retrieval/hybrid] Semantic search failed — falling back to BM25-only: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return [] as RetrievalResult[];
      }),
      Promise.resolve(this.structuredSvc.query(filters, fetchLimit)),
    ]);

    const merged = reciprocalRankFusion(semanticResults, structuredResults, limit);

    if (!filters.includeSecret) {
      return merged.filter((r) => {
        const scopes = (r.metadata['scopes'] as string[] | undefined) ?? [];
        return !scopes.some(isSecretScope);
      });
    }

    return merged;
  }

  async semanticSearch(
    query: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    threshold = DEFAULT_THRESHOLD
  ): Promise<RetrievalResult[]> {
    return this.semanticSvc.search(query, filters, limit, threshold);
  }

  structuredOnly(filters: RetrievalFilters, limit = DEFAULT_LIMIT, offset = 0): RetrievalResult[] {
    return this.structuredSvc.query(filters, limit, offset);
  }

  /**
   * Find engrams similar to the given engram by its existing embedding vector.
   * No embedding call — reads the vector directly from `embeddings_vec`.
   */
  async similar(
    engramId: string,
    filters: RetrievalFilters = {},
    limit = DEFAULT_LIMIT,
    threshold = DEFAULT_THRESHOLD
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
