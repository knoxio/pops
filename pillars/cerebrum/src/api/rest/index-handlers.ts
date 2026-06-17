/**
 * ts-rest handlers for `cerebrum.index.*` (thalamus).
 *
 * Each handler builds a request-scoped {@link IndexService} bound to the pillar
 * DB handle, engram root, a fresh {@link EngramService} (for the fs→index
 * rebuild), the injected peer clients (cross-source scan), and the
 * embeddings-queue accessor, then delegates. The service is stateless and never
 * throws domain `HttpError`s, so the responses are plain 200 envelopes.
 *
 * Queue null path (no Redis): `status.embeddingsQueue.pendingCount` is `null`;
 * `reindex` / `reindexSources` still run their non-enqueue work and report
 * `enqueued: 0` — a missing producer is soft, never a 503.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumIndexContract } from '../../contract/rest-index.js';
import { type CerebrumDb } from '../../db/index.js';
import { EngramService } from '../modules/engrams/service.js';
import { IndexService } from '../modules/thalamus/service.js';

import type { PeerClients } from '../modules/retrieval/peer-clients.js';
import type { TemplateRegistry } from '../modules/templates/registry.js';
import type { EmbeddingsQueueAccessor } from '../modules/thalamus/queue.js';

const server: ReturnType<typeof initServer> = initServer();

export interface IndexHandlerDeps {
  db: CerebrumDb;
  engramRoot: string;
  templates: TemplateRegistry;
  peers: PeerClients;
  queueAccessor: EmbeddingsQueueAccessor;
}

export function makeIndexHandlers(
  deps: IndexHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumIndexContract>> {
  const service = (): IndexService =>
    new IndexService({
      db: deps.db,
      engramRoot: deps.engramRoot,
      engramService: new EngramService({
        root: deps.engramRoot,
        db: deps.db,
        templates: deps.templates,
      }),
      peers: deps.peers,
      queueAccessor: deps.queueAccessor,
    });

  return server.router(cerebrumIndexContract, {
    status: async () => {
      const body = await service().status();
      return { status: 200 as const, body };
    },

    reindex: async ({ body }) => {
      const result = await service().reindex(body.force ?? false);
      return { status: 200 as const, body: result };
    },

    reindexSources: async ({ body }) => {
      const result = await service().reindexSources(body.sourceTypes);
      return { status: 200 as const, body: result };
    },

    reconcile: async ({ body }) => {
      const result = service().reconcile(body.dryRun ?? false);
      return { status: 200 as const, body: result };
    },
  });
}
