/**
 * Handlers for the `cook.*` sub-router (PRD-144).
 *
 * `prepareCook` maps the internal `PrepareCookError` (missing recipe
 * version / plan entry) to a 404 `{ message }` envelope, mirroring the
 * tRPC `NOT_FOUND` the old router threw; every other failure propagates to
 * Express. `markCooked` returns its full `MarkCookedResult` discriminated
 * union on a 200 — domain failures are `{ ok: false, reason }`, not HTTP
 * errors — wrapped in the shared `runHttp` passthrough.
 */
import { markCooked } from '../modules/cook/mark-cooked.js';
import { prepareCook, PrepareCookError } from '../modules/cook/prepare.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { z } from 'zod';

import type { MarkCookedResultSchema } from '../../contract/rest-cook-schemas.js';
import type { foodCookContract } from '../../contract/rest-cook.js';
import type { FoodDb } from '../../db/index.js';
import type { MarkCookedResult } from '../../domain/types/cook.js';

type Req = ServerInferRequest<typeof foodCookContract>;
type MarkCookedBody = z.infer<typeof MarkCookedResultSchema>;

export function makeCookHandlers(db: FoodDb) {
  return {
    prepareCook: async ({ body }: Req['prepareCook']) => {
      try {
        const prep = prepareCook(db, {
          recipeVersionId: body.recipeVersionId,
          planEntryId: body.planEntryId,
        });
        // The contract projects `consumeNeeds` as a mutable array; the
        // domain type returns it `readonly`, so copy it to match.
        return {
          status: 200 as const,
          body: { ...prep, consumeNeeds: [...prep.consumeNeeds] },
        };
      } catch (err) {
        if (err instanceof PrepareCookError) {
          return { status: 404 as const, body: { message: err.reason } };
        }
        throw err;
      }
    },

    markCooked: ({ body }: Req['markCooked']) =>
      runHttp(() => ({ status: 200 as const, body: toMarkCookedBody(markCooked(db, body)) })),
  };
}

/**
 * The contract projects `shortfalls` as a mutable array; the domain result
 * types it `readonly`, so copy it to match the inferred response shape.
 */
function toMarkCookedBody(result: MarkCookedResult): MarkCookedBody {
  if (result.ok) return result;
  if (result.shortfalls === undefined) return { ok: false, reason: result.reason };
  return { ok: false, reason: result.reason, shortfalls: [...result.shortfalls] };
}
