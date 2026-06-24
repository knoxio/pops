/**
 * ts-rest handlers for `cerebrum.query.*` (docs/prds/query-engine).
 *
 * Each handler builds a request-scoped {@link QueryService} bound to the pillar
 * db (drizzle + raw + vec availability), the injected peer/embedding retrieval
 * clients, and the injected {@link QueryLlm}/{@link QueryStreamLlm} ports, then
 * delegates. The service is stateless — all scope/domain filtering rides in the
 * request body — so there is no per-request auth.
 *
 * The streaming variant is NOT here: SSE can't be modelled by ts-rest, so it is
 * mounted as a plain Express route in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumQueryContract } from '../../contract/rest-query.js';
import { type CerebrumDb } from '../../db/index.js';
import { type QueryLlm, type QueryStreamLlm } from '../modules/query/llm.js';
import { QueryService, type QueryServiceDeps } from '../modules/query/query-service.js';
import { runHttp } from './error-mapping.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';

const server: ReturnType<typeof initServer> = initServer();

export interface QueryHandlerDeps {
  db: CerebrumDb;
  raw: BetterSqlite3.Database;
  vecAvailable: boolean;
  peers: PeerClients;
  embeddingClient?: EmbeddingClient;
  llm: QueryLlm;
  streamLlm: QueryStreamLlm;
}

export function makeQueryHandlers(
  deps: QueryHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumQueryContract>> {
  const serviceDeps: QueryServiceDeps = {
    db: deps.db,
    raw: deps.raw,
    vecAvailable: deps.vecAvailable,
    peers: deps.peers,
    embeddingClient: deps.embeddingClient,
    llm: deps.llm,
    streamLlm: deps.streamLlm,
  };
  const service = (): QueryService => new QueryService(serviceDeps);

  return server.router(cerebrumQueryContract, {
    ask: async ({ body }) =>
      runHttp(async () => {
        const result = await service().ask({
          question: body.question,
          scopes: body.scopes,
          includeSecret: body.includeSecret,
          maxSources: body.maxSources,
          domains: body.domains,
        });
        return { status: 200 as const, body: result };
      }),

    retrieve: async ({ body }) =>
      runHttp(async () => {
        const result = await service().retrieve(
          body.question,
          body.scopes,
          body.includeSecret,
          body.maxSources
        );
        return { status: 200 as const, body: result };
      }),

    explain: async ({ body }) =>
      runHttp(() => {
        const result = service().explain(body.question);
        return { status: 200 as const, body: result };
      }),
  });
}
