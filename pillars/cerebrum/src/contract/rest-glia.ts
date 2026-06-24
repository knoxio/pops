/**
 * ts-rest contract for `cerebrum.glia.*`.
 *
 * Glia is the autonomous-curation trust/action router: a proposal queue, the
 * decide/execute/revert lifecycle, per-action-type trust state, and an
 * audit-trail digest. Non-identity domain — served on the docker-network trust
 * boundary with no per-request auth (parity with templates / reflex / engrams).
 *
 * Typed/array/filter inputs ride in POST bodies rather than the query string
 * (mirrors the reflex `history` + engrams `search` precedent):
 *   - `actions.list` / `actions.history` carry enum filters in a POST body.
 *   - `actions.decide` carries the decision enum + note in a POST body.
 *   - `digest` carries the period/actionType/threshold/deliver flags in a body.
 *
 * `actions.get` and the trust-state reads carry only path params, so they stay
 * GET. The literal-list `GET /glia/trust-state` and the param read
 * `GET /glia/trust-state/:actionType` do not collide (the list has no path
 * segment after `trust-state`).
 *
 * The glia wire schemas live in `rest-glia-schemas.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  gliaActionFilterSchema,
  gliaActionSchema,
  gliaActionTypeSchema,
  gliaDigestDeliverySchema,
  gliaDigestReportSchema,
  gliaRevertResultSchema,
  gliaTransitionResultSchema,
  gliaTrustStateSchema,
  gliaUserDecisionSchema,
} from './rest-glia-schemas.js';
import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

const idParams = z.object({ id: z.string().min(1) });

const actionsContract = c.router({
  list: {
    method: 'POST',
    path: '/glia/actions/search',
    summary: 'List glia actions matching the supplied filters (proposal queue + audit trail).',
    body: gliaActionFilterSchema,
    responses: {
      200: z.object({ actions: z.array(gliaActionSchema), total: z.number().int() }),
    },
  },
  get: {
    method: 'GET',
    path: '/glia/actions/:id',
    summary: 'Get a single glia action by id.',
    pathParams: idParams,
    responses: {
      200: z.object({ action: gliaActionSchema }),
      404: errorBodySchema,
    },
  },
  decide: {
    method: 'POST',
    path: '/glia/actions/:id/decide',
    summary: 'Record a user decision on a pending action; eagerly re-evaluate graduation.',
    pathParams: idParams,
    body: z.object({
      decision: gliaUserDecisionSchema,
      note: z.string().optional(),
    }),
    responses: {
      200: z.object({
        action: gliaActionSchema,
        transition: gliaTransitionResultSchema,
      }),
      400: errorBodySchema,
      404: errorBodySchema,
      409: errorBodySchema,
    },
  },
  execute: {
    method: 'POST',
    path: '/glia/actions/:id/execute',
    summary: 'Execute an approved action.',
    pathParams: idParams,
    body: z.object({}),
    responses: {
      200: z.object({ action: gliaActionSchema }),
      404: errorBodySchema,
      409: errorBodySchema,
    },
  },
  revert: {
    method: 'POST',
    path: '/glia/actions/:id/revert',
    summary: 'Revert an executed action (DB-state flip + file-level undo).',
    pathParams: idParams,
    body: z.object({}),
    responses: {
      200: z.object({
        action: gliaActionSchema,
        transition: gliaTransitionResultSchema,
        revertResult: gliaRevertResultSchema,
      }),
      400: errorBodySchema,
      404: errorBodySchema,
      409: errorBodySchema,
    },
  },
  history: {
    method: 'POST',
    path: '/glia/actions/history',
    summary: 'Query the action audit trail (filtered + paginated).',
    body: gliaActionFilterSchema,
    responses: {
      200: z.object({ actions: z.array(gliaActionSchema), total: z.number().int() }),
    },
  },
});

const trustStateContract = c.router({
  get: {
    method: 'GET',
    path: '/glia/trust-state/:actionType',
    summary: 'Get trust state for a single action type.',
    pathParams: z.object({ actionType: gliaActionTypeSchema }),
    responses: {
      200: z.object({ state: gliaTrustStateSchema }),
      404: errorBodySchema,
    },
  },
  list: {
    method: 'GET',
    path: '/glia/trust-state',
    summary: 'List trust state for every action type.',
    responses: {
      200: z.object({ states: z.array(gliaTrustStateSchema) }),
    },
  },
});

export const cerebrumGliaContract = c.router({
  actions: actionsContract,
  trustState: trustStateContract,
  digest: {
    method: 'POST',
    path: '/glia/digest',
    summary: 'Generate (and optionally deliver) the autonomous-action digest.',
    body: z.object({
      period: z.enum(['daily', 'weekly']).optional(),
      actionType: gliaActionTypeSchema.optional(),
      rejectionRateThreshold: z.number().gt(0).lte(1).optional(),
      deliver: z.boolean().optional(),
    }),
    responses: {
      200: z.object({
        report: gliaDigestReportSchema,
        delivery: gliaDigestDeliverySchema,
      }),
    },
  },
});
