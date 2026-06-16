import { recipesUsingBatch } from '../modules/fridge/recipes-using-batch.js';
/**
 * Handlers for the `fridge.*` sub-router. Both are read-only; the view +
 * grouping logic lives in the lifted `modules/fridge/` helpers.
 */
import { fridgeView } from '../modules/fridge/view.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodFridgeContract } from '../../contract/rest-fridge.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodFridgeContract>;

export function makeFridgeHandlers(db: FoodDb) {
  return {
    view: ({ body }: Req['view']) =>
      runHttp(() => ({ status: 200 as const, body: fridgeView(db, body) })),

    recipesUsingBatch: ({ query }: Req['recipesUsingBatch']) =>
      runHttp(() => ({
        status: 200 as const,
        body: recipesUsingBatch(db, query.batchId, query.limit),
      })),
  };
}
