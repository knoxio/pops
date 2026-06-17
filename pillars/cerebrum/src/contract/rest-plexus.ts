/**
 * ts-rest contract for `cerebrum.plexus.*`.
 *
 * Plexus is the external-adapter registry: adapter CRUD + per-adapter
 * ingestion-filter management. Non-identity domain — served on the
 * docker-network trust boundary with no per-request auth (parity with
 * templates).
 *
 * The two queries that take typed input (`adapters.get`, `filters.list`)
 * carry their input in the path; `filters.set` and the lifecycle mutations
 * (`healthCheck` / `sync` / `unregister`) are POSTs — typed bodies don't
 * round-trip cleanly through a query string (mirrors the food precedent).
 * `unregister` is modelled as a POST sub-action rather than `DELETE` so the
 * verb stays uniform with the other lifecycle mutations.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  errorBodySchema,
  plexusAdapterSchema,
  plexusFilterDefinitionSchema,
  plexusFilterSchema,
  plexusHealthResultSchema,
  plexusSyncResultSchema,
} from './rest-schemas.js';

const c = initContract();

const adapterIdParams = z.object({ adapterId: z.string().min(1) });

const adaptersContract = c.router({
  list: {
    method: 'GET',
    path: '/plexus/adapters',
    summary: 'List every registered plexus adapter.',
    responses: {
      200: z.object({ adapters: z.array(plexusAdapterSchema) }),
    },
  },
  get: {
    method: 'GET',
    path: '/plexus/adapters/:adapterId',
    summary: 'Get a single plexus adapter by id.',
    pathParams: adapterIdParams,
    responses: {
      200: z.object({ adapter: plexusAdapterSchema }),
      404: errorBodySchema,
    },
  },
  healthCheck: {
    method: 'POST',
    path: '/plexus/adapters/:adapterId/health-check',
    summary: 'Run an on-demand health check against an adapter.',
    pathParams: adapterIdParams,
    body: z.object({}),
    responses: {
      200: plexusHealthResultSchema,
    },
  },
  sync: {
    method: 'POST',
    path: '/plexus/adapters/:adapterId/sync',
    summary: 'Trigger a manual ingestion cycle for an adapter.',
    pathParams: adapterIdParams,
    body: z.object({}),
    responses: {
      200: plexusSyncResultSchema,
    },
  },
  unregister: {
    method: 'POST',
    path: '/plexus/adapters/:adapterId/unregister',
    summary: 'Shut down and remove an adapter.',
    pathParams: adapterIdParams,
    body: z.object({}),
    responses: {
      200: z.object({ success: z.boolean() }),
    },
  },
});

const filtersContract = c.router({
  list: {
    method: 'GET',
    path: '/plexus/adapters/:adapterId/filters',
    summary: 'List the ingestion filters for an adapter.',
    pathParams: adapterIdParams,
    responses: {
      200: z.object({ filters: z.array(plexusFilterSchema) }),
    },
  },
  set: {
    method: 'POST',
    path: '/plexus/adapters/:adapterId/filters',
    summary: 'Atomically replace the ingestion filters for an adapter.',
    pathParams: adapterIdParams,
    body: z.object({ filters: z.array(plexusFilterDefinitionSchema) }),
    responses: {
      200: z.object({ filters: z.array(plexusFilterSchema) }),
      400: errorBodySchema,
      404: errorBodySchema,
    },
  },
});

export const cerebrumPlexusContract = c.router({
  adapters: adaptersContract,
  filters: filtersContract,
});
