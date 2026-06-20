import { initServer } from '@ts-rest/express';
/**
 * ts-rest handlers for `cerebrum.retrieval.*`.
 *
 * Each handler builds a request-scoped {@link HybridSearchService} bound to the
 * pillar db (drizzle + raw + vec availability), the injected peer clients, and
 * the optional embedding client. The services are stateless — all filtering
 * rides in the request body — so there is no per-request auth.
 *
 * `stats` reads coverage counts straight off the pillar drizzle handle. The
 * search/context query-required + structured filter-required guards map to 400
 * via the pillar {@link ValidationError} + `runHttp`.
 */
import { count, sql } from 'drizzle-orm';

import { cerebrumRetrievalContract } from '../../contract/rest-retrieval.js';
import { embeddings, engramIndex, type CerebrumDb } from '../../db/index.js';
import { ContextAssemblyService } from '../modules/retrieval/context-assembly.js';
import { HybridSearchService } from '../modules/retrieval/hybrid-search.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';
import type { RetrievalFilters } from '../modules/retrieval/types.js';

const server: ReturnType<typeof initServer> = initServer();

export interface RetrievalHandlerDeps {
  db: CerebrumDb;
  raw: BetterSqlite3.Database;
  vecAvailable: boolean;
  peers: PeerClients;
  embeddingClient?: EmbeddingClient;
}

function hasAnyStructuredFilter(filters: RetrievalFilters): boolean {
  if (filters.customFields) return true;
  if (filters.dateRange?.from || filters.dateRange?.to) return true;
  const arrayLengths = [
    filters.types?.length,
    filters.scopes?.length,
    filters.tags?.length,
    filters.status?.length,
    filters.sourceTypes?.length,
  ];
  return arrayLengths.some((n) => (n ?? 0) > 0);
}

function readStats(db: CerebrumDb): {
  indexed: number;
  embedded: number;
  sourceTypes: Record<string, number>;
  lastUpdated: string | null;
} {
  const [indexedRow] = db.select({ count: count() }).from(engramIndex).all();
  const indexed = indexedRow?.count ?? 0;

  const sourceTypeRows = db
    .select({ sourceType: embeddings.sourceType, count: count() })
    .from(embeddings)
    .groupBy(embeddings.sourceType)
    .all();

  const embedded = sourceTypeRows.reduce((sum, r) => sum + r.count, 0);
  const sourceTypes = Object.fromEntries(sourceTypeRows.map((r) => [r.sourceType, r.count]));

  const [lastRow] = db
    .select({ lastUpdated: sql<string | null>`max(${embeddings.createdAt})` })
    .from(embeddings)
    .all();

  return { indexed, embedded, sourceTypes, lastUpdated: lastRow?.lastUpdated ?? null };
}

export function makeRetrievalHandlers(
  deps: RetrievalHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumRetrievalContract>> {
  const newService = (): HybridSearchService =>
    new HybridSearchService({
      db: deps.db,
      raw: deps.raw,
      vecAvailable: deps.vecAvailable,
      peers: deps.peers,
      embeddingClient: deps.embeddingClient,
    });

  return server.router(cerebrumRetrievalContract, {
    search: async ({ body }) =>
      runHttp(async () => {
        const filters: RetrievalFilters = body.filters ?? {};

        if (body.mode !== 'structured' && !body.query?.trim()) {
          throw new ValidationError({ message: 'retrieval.queryRequired' });
        }
        if (body.mode === 'structured' && !hasAnyStructuredFilter(filters)) {
          throw new ValidationError({ message: 'retrieval.filterRequired' });
        }

        const svc = newService();
        const query = body.query ?? '';
        let results;
        switch (body.mode) {
          case 'semantic':
            results = await svc.semanticSearch(query, filters, body.limit, body.threshold);
            break;
          case 'structured':
            results = svc.structuredOnly(filters, body.limit, body.offset);
            break;
          case 'hybrid':
          default:
            results = await svc.hybrid(query, filters, body.limit, body.threshold);
        }

        return {
          status: 200 as const,
          body: { results, meta: { total: results.length, mode: body.mode } },
        };
      }),

    context: async ({ body }) =>
      runHttp(async () => {
        if (!body.query.trim()) {
          throw new ValidationError({ message: 'retrieval.contextQueryRequired' });
        }
        const svc = newService();
        const assembler = new ContextAssemblyService();
        const filters: RetrievalFilters = body.filters ?? {};

        const results = await svc.hybrid(body.query, filters, body.maxResults, 0.8);
        const output = assembler.assemble({
          query: body.query,
          results,
          tokenBudget: body.tokenBudget,
          includeMetadata: body.includeMetadata,
        });

        return { status: 200 as const, body: output };
      }),

    similar: async ({ body }) => {
      const svc = newService();
      const filters: RetrievalFilters = body.filters ?? {};
      const results = await svc.similar(body.engramId, filters, body.limit, body.threshold);
      return { status: 200, body: { results } };
    },

    stats: async () => ({ status: 200, body: readStats(deps.db) }),
  });
}
