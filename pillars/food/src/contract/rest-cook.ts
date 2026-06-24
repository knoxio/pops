/**
 * `cook.*` sub-router — the cook flow.
 *
 * `prepareCook` is the modal-open pre-flight; `markCooked` is the
 * single-transaction cook event. Both are POST-with-body: the inputs carry
 * typed numbers + a discriminated `consumptionOverrides[]` union that
 * doesn't round-trip cleanly through query strings, and `prepareCook` is a
 * read modelled the same way as `solver.canICook` / `inbox.list`.
 *
 * `prepareCook` answers 404 (`{ message }`) when the recipe version (or a
 * supplied plan entry) is missing — the handler maps the internal
 * `PrepareCookError` onto that envelope. `markCooked` returns its full
 * `MarkCookedResult` discriminated union on 200; failures are domain
 * outcomes (`{ ok: false, reason }`), not HTTP errors.
 */
import { initContract } from '@ts-rest/core';

import {
  CookPreparationSchema,
  MarkCookedInputSchema,
  MarkCookedResultSchema,
  PrepareCookInputSchema,
} from './rest-cook-schemas.js';
import { MessageSchema } from './rest-schemas.js';

const c = initContract();

export const foodCookContract = c.router({
  prepareCook: {
    method: 'POST',
    path: '/cook/prepare',
    body: PrepareCookInputSchema,
    responses: { 200: CookPreparationSchema, 404: MessageSchema },
    summary: 'Pre-flight data for the cook modal',
  },
  markCooked: {
    method: 'POST',
    path: '/cook/mark-cooked',
    body: MarkCookedInputSchema,
    responses: { 200: MarkCookedResultSchema },
    summary: 'Record a cook event in one transaction',
  },
});
