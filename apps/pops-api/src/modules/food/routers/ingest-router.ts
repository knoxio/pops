/**
 * PRD-125 — tRPC router for the food ingest pipeline.
 *
 * Procedures (all under `food.ingest.*`):
 *
 *   - `start`           — public mutation; validates input, writes the
 *                          `ingest_sources` row, decodes screenshots to
 *                          disk, enqueues the BullMQ job.
 *   - `status`          — public query; combines BullMQ live state with
 *                          the persisted DB row.
 *   - `list`            — public query; cursor-paginated for the inbox UI
 *                          (Epic 03 consumes this).
 *   - `cancel`          — public mutation; best-effort BullMQ removal.
 *   - `retry`           — public mutation; re-enqueues a failed job using
 *                          the persisted source row.
 *   - `workerComplete`  — internal mutation (POPS_API_INTERNAL_TOKEN);
 *                          the pops-worker-food container (PRD-126) posts
 *                          back here on every job — success or failure.
 *
 * Per R1 Option B (roadmap): `workerComplete` creates the recipe row +
 * first draft version + slug_registry entry inline via direct Drizzle
 * (not PRD-119's tRPC, which doesn't exist yet). PRD-119 will replace
 * that path when it lands. Compile is deferred to PRD-119's promote flow
 * — the draft stays uncompiled until the user approves it from the inbox.
 */
import { TRPCError } from '@trpc/server';

import { getDrizzle } from '../../../db.js';
import { internalProcedure, publicProcedure, router } from '../../../trpc.js';
import { IngestQueueUnavailable } from '../services/ingest-enqueue.js';
import { applyWorkerComplete } from '../services/ingest-worker-complete.js';
import { cancelIngest, retryIngest } from './ingest-procedures-control.js';
import { startIngest } from './ingest-procedures-start.js';
import { getIngestStatus, listIngestSources } from './ingest-procedures-status.js';
import {
  IngestCancelInput,
  IngestCancelOutput,
  IngestListInput,
  IngestListOutput,
  IngestRetryInput,
  IngestRetryOutput,
  IngestStartInput,
  IngestStartOutput,
  IngestStatusOutput,
  WorkerCompleteInput,
  WorkerCompleteOutput,
} from './ingest-schemas.js';

import type { FoodDb } from '@pops/app-food-db';
import type { PartialReason } from '@pops/food/queue';

// `getDrizzle` returns a `BetterSQLite3Database<Record<string, unknown>>`;
// `FoodDb` from `@pops/app-food-db` is the same structural type, so the
// assignment is direct (no cast needed).
const foodDb = (): FoodDb => getDrizzle();

export const ingestRouter = router({
  start: publicProcedure
    .input(IngestStartInput)
    .output(IngestStartOutput)
    .mutation(async ({ input }) => {
      try {
        return await startIngest({ db: foodDb() }, input);
      } catch (err) {
        if (err instanceof IngestQueueUnavailable) {
          throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: err.message,
          });
        }
        throw err;
      }
    }),

  status: publicProcedure
    .input(IngestCancelInput) // shape matches: { sourceId }
    .output(IngestStatusOutput.nullable())
    .query(async ({ input }) => {
      return getIngestStatus(foodDb(), input.sourceId);
    }),

  list: publicProcedure
    .input(IngestListInput)
    .output(IngestListOutput)
    .query(async ({ input }) => {
      return listIngestSources(foodDb(), input);
    }),

  cancel: publicProcedure
    .input(IngestCancelInput)
    .output(IngestCancelOutput)
    .mutation(async ({ input }) => {
      return cancelIngest(input.sourceId);
    }),

  retry: publicProcedure
    .input(IngestRetryInput)
    .output(IngestRetryOutput)
    .mutation(async ({ input }) => {
      try {
        return await retryIngest(foodDb(), input.sourceId);
      } catch (err) {
        if (err instanceof IngestQueueUnavailable) {
          throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: err.message,
          });
        }
        throw err;
      }
    }),

  workerComplete: internalProcedure
    .input(WorkerCompleteInput)
    .output(WorkerCompleteOutput)
    .mutation(({ input }) => {
      const db = foodDb();
      if (input.ok) {
        return applyWorkerComplete(db, input.sourceId, {
          ok: true,
          dsl: input.dsl,
          meta: input.meta,
          ...(input.partialReason === undefined
            ? {}
            : { partialReason: input.partialReason as PartialReason }),
        });
      }
      return applyWorkerComplete(db, input.sourceId, {
        ok: false,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        meta: input.meta,
      });
    }),
});

export type IngestRouter = typeof ingestRouter;
