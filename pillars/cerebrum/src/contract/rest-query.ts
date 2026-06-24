/**
 * ts-rest contract for `cerebrum.query.*` — the NL Q&A engine.
 *
 * STATELESS: scope/domain filtering rides in the request body, never derived
 * from a caller identity. Served on the docker-network trust boundary with no
 * per-request auth, like the other domains.
 *
 * `ask` / `retrieve` / `explain` are all POST (the bodies carry scope/domain
 * arrays). The SSE stream variant (`POST /query/stream`) cannot be modelled by
 * ts-rest, so it is mounted as a plain Express route in `app.ts` ahead of
 * `createExpressEndpoints`; its request body matches `queryStreamBodySchema`
 * (the `ask` body). The generated OpenAPI derives dotted operation ids
 * (`query.ask`, …) from the router keys via `setOperationId`.
 */
import { initContract } from '@ts-rest/core';

import {
  queryAskBodySchema,
  queryAskResponseSchema,
  queryExplainBodySchema,
  queryExplainResponseSchema,
  queryRetrieveBodySchema,
  queryRetrieveResponseSchema,
} from './rest-query-schemas.js';
import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

export const cerebrumQueryContract = c.router({
  ask: {
    method: 'POST',
    path: '/query/ask',
    summary: 'Full NL Q&A: scope inference → retrieval → LLM → citation parsing.',
    body: queryAskBodySchema,
    responses: {
      200: queryAskResponseSchema,
      400: errorBodySchema,
    },
  },
  retrieve: {
    method: 'POST',
    path: '/query/retrieve',
    summary: 'Retrieval-only — returns sources without calling the LLM.',
    body: queryRetrieveBodySchema,
    responses: {
      200: queryRetrieveResponseSchema,
      400: errorBodySchema,
    },
  },
  explain: {
    method: 'POST',
    path: '/query/explain',
    summary: 'Debug: show scope inference + retrieval plan without executing.',
    body: queryExplainBodySchema,
    responses: {
      200: queryExplainResponseSchema,
      400: errorBodySchema,
    },
  },
});

export type CerebrumQueryContract = typeof cerebrumQueryContract;
