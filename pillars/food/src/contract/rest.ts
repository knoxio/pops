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

import { foodConversionsContract } from './rest-conversions.js';

const c = initContract();

export const foodContract = c.router(
  {
    conversions: foodConversionsContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type FoodRestContract = typeof foodContract;
