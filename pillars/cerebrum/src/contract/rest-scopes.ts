/**
 * ts-rest contract for `cerebrum.scopes.*`.
 *
 * Scopes are dot-separated hierarchical tags on engrams. This sub-router
 * exposes the scope-management surface: assign/remove on an engram, the bulk
 * prefix-rename (`reclassify`), the vocabulary list, single-scope validation,
 * reconciliation against the known vocabulary, and the prefix filter.
 *
 * Array inputs ride in POST bodies (they don't round-trip cleanly through a
 * query string); `remove` is a POST sub-action rather than DELETE because a
 * DELETE can't carry a scope array body cleanly. `list` keeps the optional
 * `prefix` in the query string. Non-identity domain — docker-net trust, no
 * per-request auth.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  engramIdSchema,
  engramSchema,
  errorBodySchema,
  scopeInfoSchema,
  scopeSuggestionSchema,
} from './rest-schemas.js';

const c = initContract();

const engramIdParams = z.object({ engramId: engramIdSchema });
const scopesArray = z.array(z.string().min(1)).min(1);

export const cerebrumScopesContract = c.router({
  assign: {
    method: 'POST',
    path: '/engrams/:engramId/scopes',
    summary: 'Add scopes to an engram (merged with its existing scopes).',
    pathParams: engramIdParams,
    body: z.object({ scopes: scopesArray }),
    responses: {
      200: z.object({ engram: engramSchema }),
      400: errorBodySchema,
      404: errorBodySchema,
    },
  },
  remove: {
    method: 'POST',
    path: '/engrams/:engramId/scopes/remove',
    summary: 'Remove scopes from an engram (rejects removing the last scope).',
    pathParams: engramIdParams,
    body: z.object({ scopes: scopesArray }),
    responses: {
      200: z.object({ engram: engramSchema }),
      400: errorBodySchema,
      404: errorBodySchema,
    },
  },
  reclassify: {
    method: 'POST',
    path: '/scopes/reclassify',
    summary: 'Bulk prefix-rename a scope across every matching engram (atomic).',
    body: z.object({
      fromScope: z.string().min(1),
      toScope: z.string().min(1),
      dryRun: z.boolean().optional(),
    }),
    responses: {
      200: z.object({
        count: z.number().int(),
        ids: z.array(z.string()),
        rolled_back: z.boolean().optional(),
      }),
      400: errorBodySchema,
    },
  },
  list: {
    method: 'GET',
    path: '/scopes',
    summary: 'List known scopes with engram counts, optionally filtered by prefix.',
    query: z.object({ prefix: z.string().min(1).optional() }),
    responses: {
      200: z.object({ scopes: z.array(scopeInfoSchema) }),
      400: errorBodySchema,
    },
  },
  validate: {
    method: 'POST',
    path: '/scopes/validate',
    summary: 'Validate a single scope string; returns structured errors on failure.',
    body: z.object({ scope: z.string() }),
    responses: {
      200: z.object({
        valid: z.boolean(),
        scope: z.string().optional(),
        errors: z.array(z.string()).optional(),
      }),
    },
  },
  reconcile: {
    method: 'POST',
    path: '/scopes/reconcile',
    summary: 'Reconcile user-suggested scopes against the known vocabulary.',
    body: z.object({ suggestedScopes: scopesArray }),
    responses: {
      200: z.object({ reconciled: z.array(scopeSuggestionSchema) }),
      400: errorBodySchema,
    },
  },
  filter: {
    method: 'POST',
    path: '/scopes/filter',
    summary: 'Return engrams matching scope prefixes (secret-scoped excluded by default).',
    body: z.object({
      scopes: z.array(z.string().min(1)),
      includeSecret: z.boolean().optional(),
    }),
    responses: {
      200: z.object({ engrams: z.array(engramSchema) }),
      400: errorBodySchema,
    },
  },
});
