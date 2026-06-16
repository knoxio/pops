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
 * router (see docs/runbooks/food-rest-migration.md).
 */
import { initContract } from '@ts-rest/core';

import { foodAliasesContract } from './rest-aliases.js';
import { foodConversionsContract } from './rest-conversions.js';
import { foodIngredientTagsContract } from './rest-ingredient-tags.js';
import { foodIngredientsContract } from './rest-ingredients.js';
import { foodPrepStatesContract } from './rest-prep-states.js';
import { foodSlugsContract } from './rest-slugs.js';
import { foodVariantsContract } from './rest-variants.js';

const c = initContract();

export const foodContract = c.router(
  {
    aliases: foodAliasesContract,
    conversions: foodConversionsContract,
    ingredients: foodIngredientsContract,
    ingredientTags: foodIngredientTagsContract,
    prepStates: foodPrepStatesContract,
    slugs: foodSlugsContract,
    variants: foodVariantsContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type FoodRestContract = typeof foodContract;
