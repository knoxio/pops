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
import { makeAliasesHandlers } from './aliases-handlers.js';
import { makeConversionsHandlers } from './conversions-handlers.js';
import { makeIngredientTagsHandlers } from './ingredient-tags-handlers.js';
import { makePrepStatesHandlers } from './prep-states-handlers.js';
import { makeSlugsHandlers } from './slugs-handlers.js';
import { makeVariantsHandlers } from './variants-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeFoodRestHandlers(deps: {
  foodDb: OpenedFoodDb;
}): ReturnType<typeof server.router<typeof foodContract>> {
  const db = deps.foodDb.db;
  return server.router(foodContract, {
    aliases: makeAliasesHandlers(db),
    conversions: makeConversionsHandlers(db),
    ingredientTags: makeIngredientTagsHandlers(db),
    prepStates: makePrepStatesHandlers(db),
    slugs: makeSlugsHandlers(db),
    variants: makeVariantsHandlers(db),
  });
}
