/**
 * Handlers for the `ingest.*` sub-router.
 *
 * `start` / `retry` translate `IngestQueueUnavailable` (Redis not wired)
 * into a 503 envelope; every other failure propagates to Express. `status`
 * returns `null` on a 200 when the source id is unknown (the contract body
 * is nullable). `workerComplete` reshapes the validated body into the
 * `IngestJobResult` discriminated union the service consumes.
 */
import { IngestQueueUnavailable } from '../modules/ingest/ingest-enqueue.js';
import { cancelIngest, retryIngest } from '../modules/ingest/ingest-procedures-control.js';
import { startIngest } from '../modules/ingest/ingest-procedures-start.js';
import { getIngestStatus, listIngestSources } from '../modules/ingest/ingest-procedures-status.js';
import { applyWorkerComplete } from '../modules/ingest/ingest-worker-complete.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { IngestJobResult } from '../../contract/queue/index.js';
import type { foodIngestContract } from '../../contract/rest-ingest.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodIngestContract>;

const QUEUE_UNAVAILABLE = (message: string) => ({ status: 503 as const, body: { message } });

function toJobResult(body: Req['workerComplete']['body']): IngestJobResult {
  if (body.ok) {
    return {
      ok: true,
      dsl: body.dsl,
      meta: body.meta,
      ...(body.partialReason === undefined ? {} : { partialReason: body.partialReason }),
    };
  }
  return {
    ok: false,
    errorCode: body.errorCode,
    errorMessage: body.errorMessage,
    meta: body.meta,
  };
}

export function makeIngestHandlers(db: FoodDb) {
  return {
    start: async ({ body }: Req['start']) => {
      try {
        return { status: 200 as const, body: await startIngest({ db }, body) };
      } catch (err) {
        if (err instanceof IngestQueueUnavailable) return QUEUE_UNAVAILABLE(err.message);
        throw err;
      }
    },

    status: async ({ body }: Req['status']) => ({
      status: 200 as const,
      body: await getIngestStatus(db, body.sourceId),
    }),

    list: async ({ body }: Req['list']) => ({
      status: 200 as const,
      body: await listIngestSources(db, body),
    }),

    cancel: ({ body }: Req['cancel']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await cancelIngest(body.sourceId),
      })),

    retry: async ({ body }: Req['retry']) => {
      try {
        return { status: 200 as const, body: await retryIngest(db, body.sourceId) };
      } catch (err) {
        if (err instanceof IngestQueueUnavailable) return QUEUE_UNAVAILABLE(err.message);
        throw err;
      }
    },

    workerComplete: ({ body }: Req['workerComplete']) =>
      runHttp(() => ({
        status: 200 as const,
        body: applyWorkerComplete(db, body.sourceId, toJobResult(body)),
      })),
  };
}
