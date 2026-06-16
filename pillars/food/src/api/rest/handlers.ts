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
import { makeBatchesHandlers } from './batches-handlers.js';
import { makeConversionsHandlers } from './conversions-handlers.js';
import { makeFridgeHandlers } from './fridge-handlers.js';
import { makeHeroImageHandlers } from './hero-image-handlers.js';
import { makeInboxHandlers } from './inbox-handlers.js';
import { makeIngredientTagsHandlers } from './ingredient-tags-handlers.js';
import { makeIngredientsHandlers } from './ingredients-handlers.js';
import { makePrepStatesHandlers } from './prep-states-handlers.js';
import { makeRecipesHandlers } from './recipes-handlers.js';
import { makeSlugsHandlers } from './slugs-handlers.js';
import { makeSolverHandlers } from './solver-handlers.js';
import { makeSubstitutionsHandlers } from './substitutions-handlers.js';
import { makeVariantsHandlers } from './variants-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeFoodRestHandlers(deps: {
  foodDb: OpenedFoodDb;
}): ReturnType<typeof server.router<typeof foodContract>> {
  const db = deps.foodDb.db;
  return server.router(foodContract, {
    aliases: makeAliasesHandlers(db),
    batches: makeBatchesHandlers(db),
    conversions: makeConversionsHandlers(db),
    fridge: makeFridgeHandlers(db),
    heroImage: makeHeroImageHandlers(db),
    inbox: makeInboxHandlers(db),
    ingredients: makeIngredientsHandlers(db),
    ingredientTags: makeIngredientTagsHandlers(db),
    prepStates: makePrepStatesHandlers(db),
    recipes: makeRecipesHandlers(db),
    slugs: makeSlugsHandlers(db),
    solver: makeSolverHandlers(db),
    substitutions: makeSubstitutionsHandlers(db),
    variants: makeVariantsHandlers(db),
  });
}
