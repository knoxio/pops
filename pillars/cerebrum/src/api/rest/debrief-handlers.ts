/**
 * ts-rest handlers for `cerebrum.debrief.*` (PRD-248).
 *
 * Thin adapter over {@link createDebriefService} bound to the pillar db handle.
 * `get` / `getByMedia` return `{ data: null }` for a benign miss; `record` and
 * `dismiss` surface a 404 for an unknown session via `runHttp` mapping the
 * pillar `NotFoundError`. `create` is idempotent; `deleteByWatchHistoryId`
 * cascades inside a transaction.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumDebriefContract } from '../../contract/rest-debrief.js';
import { type CerebrumDb } from '../../db/index.js';
import { createDebriefService } from '../modules/debrief/service.js';
import { runHttp } from './error-mapping.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeDebriefHandlers(
  db: CerebrumDb
): ReturnType<typeof server.router<typeof cerebrumDebriefContract>> {
  const service = createDebriefService(db);

  return server.router(cerebrumDebriefContract, {
    get: async ({ body }) => ({
      status: 200,
      body: { data: service.get(body.sessionId) },
    }),

    getByMedia: async ({ body }) => ({
      status: 200,
      body: { data: service.getByMedia(body.mediaType, body.mediaId) },
    }),

    listPending: async ({ body }) => ({
      status: 200,
      body: service.listPending(body),
    }),

    record: async ({ body }) =>
      runHttp(() => ({
        status: 200,
        body: { data: service.record(body) },
      })),

    create: async ({ body }) => ({
      status: 200,
      body: { data: service.create(body) },
    }),

    logWatchCompletion: async ({ body }) => {
      const session = service.create(body);
      return { status: 200, body: { sessionId: session.id, dimensionsQueued: 0 } };
    },

    dismiss: async ({ params }) =>
      runHttp(() => ({
        status: 200,
        body: { data: service.dismiss(params.sessionId) },
      })),

    deleteByWatchHistoryId: async ({ body }) => ({
      status: 200,
      body: service.deleteByWatchHistoryId(body.watchHistoryId),
    }),
  });
}
