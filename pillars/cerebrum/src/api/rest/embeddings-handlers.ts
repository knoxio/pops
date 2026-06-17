/**
 * ts-rest handlers for `cerebrum.embeddings.*` (PRD-249).
 *
 * Thin adapter over {@link createEmbeddingsReadService} bound to the pillar
 * db handle. Read-only — both procedures return a 200 with no error branch.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumEmbeddingsContract } from '../../contract/rest-embeddings.js';
import { type CerebrumDb } from '../../db/index.js';
import { createEmbeddingsReadService } from '../modules/embeddings/service.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeEmbeddingsHandlers(
  db: CerebrumDb
): ReturnType<typeof server.router<typeof cerebrumEmbeddingsContract>> {
  const service = createEmbeddingsReadService(db);

  return server.router(cerebrumEmbeddingsContract, {
    getStatus: async ({ body }) => ({
      status: 200,
      body: service.getStatus(body.sourceType),
    }),

    listSourceIdsByType: async ({ body }) => ({
      status: 200,
      body: { sourceIds: service.listSourceIdsByType(body.sourceType) },
    }),
  });
}
