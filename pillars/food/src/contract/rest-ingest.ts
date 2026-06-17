/**
 * `ingest.*` sub-router — PRD-125 recipe ingest pipeline.
 *
 * The food-api container is the BullMQ producer: `start` enqueues, `status`
 * / `list` read live job state + the persisted `ingest_sources` row, and
 * `cancel` / `retry` poke the queue. `workerComplete` is the internal
 * callback the pops-worker-food container posts on every job (success or
 * failure) — gated by `x-pops-internal-token` in `app.ts`.
 *
 * `start` / `retry` answer 503 when Redis is not configured (the producer
 * can't enqueue). Reads use POST-with-body — parity with `inbox.list` —
 * because the payloads carry typed numbers/cursors that don't round-trip
 * cleanly through query strings.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

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
} from './rest-ingest-schemas.js';

const c = initContract();

const QueueUnavailable = z.object({ message: z.string() });

export const foodIngestContract = c.router({
  start: {
    method: 'POST',
    path: '/ingest/start',
    body: IngestStartInput,
    responses: { 200: IngestStartOutput, 503: QueueUnavailable },
    summary: 'Start an ingest job (enqueues BullMQ work)',
  },
  status: {
    method: 'POST',
    path: '/ingest/status',
    body: IngestCancelInput,
    responses: { 200: IngestStatusOutput.nullable() },
    summary: 'Live job + persisted state for one ingest source',
  },
  list: {
    method: 'POST',
    path: '/ingest/list',
    body: IngestListInput,
    responses: { 200: IngestListOutput },
    summary: 'Cursor-paginated ingest sources for the inbox UI',
  },
  cancel: {
    method: 'POST',
    path: '/ingest/cancel',
    body: IngestCancelInput,
    responses: { 200: IngestCancelOutput },
    summary: 'Best-effort cancel of a queued ingest job',
  },
  retry: {
    method: 'POST',
    path: '/ingest/retry',
    body: IngestRetryInput,
    responses: { 200: IngestRetryOutput, 503: QueueUnavailable },
    summary: 'Re-enqueue a failed ingest job from its persisted row',
  },
  workerComplete: {
    method: 'POST',
    path: '/ingest/worker-complete',
    body: WorkerCompleteInput,
    responses: { 200: WorkerCompleteOutput },
    summary: 'Worker callback (internal; success or failure) for one job',
  },
});
