/**
 * REST contract for the food pillar — ts-rest single source of truth.
 *
 * Composes the per-domain sub-routers into the public wire surface.
 * `generateOpenApi(foodContract, …)` projects this to
 * `openapi/food.openapi.json`; `openapi-typescript` then projects the JSON
 * to `src/contract/api-types.generated.ts`.
 *
 * Lego principle: this is the ONLY description of the food wire format.
 * Don't hand-author OpenAPI or hand-author paths anywhere else.
 *
 * Domains land here slice by slice as they move off the pops-api tRPC
 * router (see pillars/food/docs/runbooks/food-rest-migration.md).
 */
import { initContract } from '@ts-rest/core';

import { foodAiContract } from './rest-ai.js';
import { foodAliasesContract } from './rest-aliases.js';
import { foodBatchesContract } from './rest-batches.js';
import { foodConversionsContract } from './rest-conversions.js';
import { foodCookContract } from './rest-cook.js';
import { foodFridgeContract } from './rest-fridge.js';
import { foodHeroImageContract } from './rest-hero-image.js';
import { foodInboxContract } from './rest-inbox.js';
import { foodIngestContract } from './rest-ingest.js';
import { foodIngredientTagsContract } from './rest-ingredient-tags.js';
import { foodIngredientsContract } from './rest-ingredients.js';
import { foodPlanContract } from './rest-plan.js';
import { foodPrepStatesContract } from './rest-prep-states.js';
import { foodRecipesContract } from './rest-recipes.js';
import { foodSendToListContract } from './rest-send-to-list.js';
import { foodShoppingContract } from './rest-shopping.js';
import { foodSlugsContract } from './rest-slugs.js';
import { foodSolverContract } from './rest-solver.js';
import { foodSubstitutionsContract } from './rest-substitutions.js';
import { foodVariantsContract } from './rest-variants.js';

const c = initContract();

export const foodContract = c.router(
  {
    ai: foodAiContract,
    aliases: foodAliasesContract,
    batches: foodBatchesContract,
    conversions: foodConversionsContract,
    cook: foodCookContract,
    fridge: foodFridgeContract,
    heroImage: foodHeroImageContract,
    inbox: foodInboxContract,
    ingest: foodIngestContract,
    ingredients: foodIngredientsContract,
    ingredientTags: foodIngredientTagsContract,
    plan: foodPlanContract,
    prepStates: foodPrepStatesContract,
    recipes: foodRecipesContract,
    sendToList: foodSendToListContract,
    shopping: foodShoppingContract,
    slugs: foodSlugsContract,
    solver: foodSolverContract,
    substitutions: foodSubstitutionsContract,
    variants: foodVariantsContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type FoodRestContract = typeof foodContract;
