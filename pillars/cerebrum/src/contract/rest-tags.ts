/**
 * ts-rest contract for `cerebrum.tags.*`.
 *
 * A single `list` query powering the ingest form's tag autocomplete. The
 * optional `prefix` + `limit` ride in the query string. Non-identity domain —
 * docker-net trust, no per-request auth.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { tagInfoSchema } from './rest-schemas.js';

const c = initContract();

export const cerebrumTagsContract = c.router({
  list: {
    method: 'GET',
    path: '/tags',
    summary: 'List known tags ranked by usage count, optionally filtered by prefix.',
    query: z.object({
      prefix: z.string().min(1).max(64).optional(),
      limit: z.coerce.number().int().positive().max(500).optional(),
    }),
    responses: {
      200: z.object({ tags: z.array(tagInfoSchema) }),
    },
  },
});
