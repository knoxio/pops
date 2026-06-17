/**
 * ts-rest handler composer for the food pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<FoodRestContract>` that `createExpressEndpoints`
 * consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { foodContract } from '../../contract/rest.js';
import { type FoodApiDeps } from '../handlers.js';
import {
  createListsHttpClient,
  type ListsClient,
  resolveListsBaseUrl,
} from '../modules/recipes/send-to-list/lists-client.js';
import { makeAiHandlers } from './ai-handlers.js';
import { makeAliasesHandlers } from './aliases-handlers.js';
import { makeBatchesHandlers } from './batches-handlers.js';
import { makeConversionsHandlers } from './conversions-handlers.js';
import { makeFridgeHandlers } from './fridge-handlers.js';
import { makeHeroImageHandlers } from './hero-image-handlers.js';
import { makeInboxHandlers } from './inbox-handlers.js';
import { makeIngredientTagsHandlers } from './ingredient-tags-handlers.js';
import { makeIngredientsHandlers } from './ingredients-handlers.js';
import { makePlanHandlers } from './plan-handlers.js';
import { makePrepStatesHandlers } from './prep-states-handlers.js';
import { makeRecipesHandlers } from './recipes-handlers.js';
import { makeSendToListHandlers } from './send-to-list-handlers.js';
import { makeShoppingHandlers } from './shopping-handlers.js';
import { makeSlugsHandlers } from './slugs-handlers.js';
import { makeSolverHandlers } from './solver-handlers.js';
import { makeSubstitutionsHandlers } from './substitutions-handlers.js';
import { makeVariantsHandlers } from './variants-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeFoodRestHandlers(
  deps: Pick<FoodApiDeps, 'foodDb' | 'listsClient'>
): ReturnType<typeof server.router<typeof foodContract>> {
  const db = deps.foodDb.db;
  // Lazy: only build the real HTTP lists client (which needs lists in
  // POPS_PILLARS) when a send-to-list request actually arrives and no stub
  // was injected.
  let realClient: ListsClient | undefined;
  const resolveListsClient = (): ListsClient =>
    deps.listsClient ?? (realClient ??= createListsHttpClient(resolveListsBaseUrl()));
  return server.router(foodContract, {
    ai: makeAiHandlers(db),
    aliases: makeAliasesHandlers(db),
    batches: makeBatchesHandlers(db),
    conversions: makeConversionsHandlers(db),
    fridge: makeFridgeHandlers(db),
    heroImage: makeHeroImageHandlers(db),
    inbox: makeInboxHandlers(db),
    ingredients: makeIngredientsHandlers(db),
    ingredientTags: makeIngredientTagsHandlers(db),
    plan: makePlanHandlers(db),
    prepStates: makePrepStatesHandlers(db),
    recipes: makeRecipesHandlers(db),
    sendToList: makeSendToListHandlers(db, resolveListsClient),
    shopping: makeShoppingHandlers(db, resolveListsClient),
    slugs: makeSlugsHandlers(db),
    solver: makeSolverHandlers(db),
    substitutions: makeSubstitutionsHandlers(db),
    variants: makeVariantsHandlers(db),
  });
}
