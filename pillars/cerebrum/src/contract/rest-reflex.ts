/**
 * ts-rest contract for `cerebrum.reflex.*`.
 *
 * Reflexes are declarative trigger/action rules the operator authors in
 * `reflexes.toml`; the pillar exposes management reads, enable/disable toggles
 * (which rewrite the TOML), a dry-run test, and the append-only execution
 * history. Non-identity domain: served on the docker-network trust boundary,
 * no per-request auth (parity with templates).
 *
 * `history` is POST-with-body rather than GET because its typed enum filters
 * (`triggerType` / `status`) don't round-trip cleanly through a query string —
 * mirrors the food pillar's `inbox.list` precedent.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  errorBodySchema,
  reflexExecutionSchema,
  reflexExecutionStatusSchema,
  reflexTriggerTypeSchema,
  reflexWithStatusSchema,
} from './rest-schemas.js';

const c = initContract();

const nameParams = z.object({ name: z.string().min(1) });

export const cerebrumReflexContract = c.router({
  list: {
    method: 'GET',
    path: '/reflex',
    summary: 'List reflexes enriched with runtime status.',
    query: z.object({ timezone: z.string().optional() }),
    responses: {
      200: z.object({ reflexes: z.array(reflexWithStatusSchema) }),
    },
  },
  get: {
    method: 'GET',
    path: '/reflex/:name',
    summary: 'Get a single reflex with its recent execution history.',
    pathParams: nameParams,
    responses: {
      200: z.object({
        reflex: reflexWithStatusSchema,
        history: z.array(reflexExecutionSchema),
      }),
      404: errorBodySchema,
    },
  },
  test: {
    method: 'POST',
    path: '/reflex/:name/test',
    summary: 'Dry-run a reflex, logging a completed test execution.',
    pathParams: nameParams,
    body: z.object({}),
    responses: {
      200: z.object({ result: reflexExecutionSchema.nullable() }),
      404: errorBodySchema,
    },
  },
  enable: {
    method: 'POST',
    path: '/reflex/:name/enable',
    summary: 'Enable a reflex (rewrites the TOML config).',
    pathParams: nameParams,
    body: z.object({}),
    responses: {
      200: z.object({ success: z.boolean() }),
      404: errorBodySchema,
    },
  },
  disable: {
    method: 'POST',
    path: '/reflex/:name/disable',
    summary: 'Disable a reflex (rewrites the TOML config).',
    pathParams: nameParams,
    body: z.object({}),
    responses: {
      200: z.object({ success: z.boolean() }),
      404: errorBodySchema,
    },
  },
  history: {
    method: 'POST',
    path: '/reflex/history',
    summary: 'Query the append-only reflex execution log (filtered + paginated).',
    body: z.object({
      name: z.string().optional(),
      triggerType: reflexTriggerTypeSchema.optional(),
      status: reflexExecutionStatusSchema.optional(),
      limit: z.number().int().positive().max(200).optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    responses: {
      200: z.object({
        executions: z.array(reflexExecutionSchema),
        total: z.number().int(),
      }),
    },
  },
});
