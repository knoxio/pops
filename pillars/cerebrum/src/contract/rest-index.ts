/**
 * ts-rest contract for `cerebrum.index.*` (thalamus).
 *
 * The engram-index maintenance surface: watcher health (`status`), full
 * fs→index reindex (`reindex`), cross-source re-embedding over peer pillars
 * (`reindexSources`), and disk↔index reconciliation (`reconcile`). Non-identity
 * domain — served on the docker-network trust boundary with no per-request
 * auth (parity with engrams / ingest). The mutations are queue- and peer-heavy;
 * the container injects the embeddings-queue accessor + peer clients in
 * `server.ts` and fakes/no-Redis in tests.
 *
 * `status` is the only GET (no body); the three mutations carry typed bodies.
 * Wire schemas live in the pure `rest-index-schemas.ts` so the contract and the
 * lifted service share one source of truth.
 */
import { initContract } from '@ts-rest/core';

import {
  indexReconcileBodySchema,
  indexReconcileResponseSchema,
  indexReindexBodySchema,
  indexReindexResponseSchema,
  indexReindexSourcesBodySchema,
  indexReindexSourcesResponseSchema,
  indexStatusResponseSchema,
} from './rest-index-schemas.js';
import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

export const cerebrumIndexContract = c.router({
  status: {
    method: 'GET',
    path: '/index/status',
    summary: 'Watcher health + embeddings-queue pending count.',
    responses: {
      200: indexStatusResponseSchema,
    },
  },
  reindex: {
    method: 'POST',
    path: '/index/reindex',
    summary: 'Rebuild the engram index from disk; force re-enqueues embeddings.',
    body: indexReindexBodySchema,
    responses: {
      200: indexReindexResponseSchema,
      400: errorBodySchema,
    },
  },
  reindexSources: {
    method: 'POST',
    path: '/index/reindex-sources',
    summary: 'Scan peer pillars and enqueue embeddings for changed source rows.',
    body: indexReindexSourcesBodySchema,
    responses: {
      200: indexReindexSourcesResponseSchema,
      400: errorBodySchema,
    },
  },
  reconcile: {
    method: 'POST',
    path: '/index/reconcile',
    summary: 'Diff disk against the index; apply unless dryRun.',
    body: indexReconcileBodySchema,
    responses: {
      200: indexReconcileResponseSchema,
      400: errorBodySchema,
    },
  },
});

export type CerebrumIndexContract = typeof cerebrumIndexContract;
