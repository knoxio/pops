/**
 * ts-rest handler composer for the food pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<FoodRestContract>` that `createExpressEndpoints`
 * consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { foodContract } from '../../contract/rest.js';
import { type OpenedFoodDb } from '../../db/index.js';
import { makeConversionsHandlers } from './conversions-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeFoodRestHandlers(deps: {
  foodDb: OpenedFoodDb;
}): ReturnType<typeof server.router<typeof foodContract>> {
  const db = deps.foodDb.db;
  return server.router(foodContract, {
    conversions: makeConversionsHandlers(db),
  });
}
