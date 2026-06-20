/**
 * ts-rest contract for `cerebrum.templates.*`.
 *
 * Templates are read-only at runtime — the operator edits `.md` files on
 * disk; the pillar exposes list/get for UIs that let the user pick a
 * template when creating an engram. Non-identity domain: served on the
 * docker-network trust boundary, no per-request auth.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { errorBodySchema, templateSchema, templateSummarySchema } from './rest-schemas.js';

const c = initContract();

export const cerebrumTemplatesContract = c.router({
  list: {
    method: 'GET',
    path: '/templates',
    summary: 'List the available engram templates (bodies stripped).',
    responses: {
      200: z.object({ templates: z.array(templateSummarySchema) }),
    },
  },
  get: {
    method: 'GET',
    path: '/templates/:name',
    summary: 'Get a single engram template by name, including its body.',
    pathParams: z.object({ name: z.string().min(1) }),
    responses: {
      200: z.object({ template: templateSchema }),
      404: errorBodySchema,
    },
  },
});
