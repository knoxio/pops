/**
 * `prepStates.*` sub-router — the small CRUD surface over the global
 * prep-state vocabulary (e.g. `diced`, `cooked`). Slugs are registered in
 * the shared slug registry, so create can fail with 400 (bad slug) or 409
 * (slug already taken under any kind).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

export const PrepStateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string(),
});

const CreatePrepStateBody = z.object({
  slug: z.string(),
  name: z.string().min(1),
});

export const foodPrepStatesContract = c.router({
  list: {
    method: 'GET',
    path: '/prep-states',
    responses: { 200: z.object({ items: z.array(PrepStateSchema) }) },
    summary: 'List prep states',
  },
  create: {
    method: 'POST',
    path: '/prep-states',
    body: CreatePrepStateBody,
    responses: { 201: z.object({ data: PrepStateSchema }), ...ERR_RESPONSES },
    summary: 'Create a prep state',
  },
});
