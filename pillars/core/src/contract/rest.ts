/**
 * REST contract for the core pillar — ts-rest single source of truth.
 *
 * Composes the migrated domain sub-routers into the public wire surface.
 * `generateOpenApi(coreContract, …)` projects this to
 * `openapi/core.openapi.json`; `openapi-typescript` then projects the JSON
 * to `src/contract/api-types.generated.ts`.
 *
 * This is the ts-rest surface that runs ALONGSIDE the legacy tRPC router
 * (mounted at `/trpc`) during the core REST migration. It starts with the
 * `entities` domain and grows as each tRPC slice converts. The tRPC router
 * is the SSoT for everything not yet listed here.
 */
import { initContract } from '@ts-rest/core';

import { coreEntitiesContract } from './rest-entities.js';

const c = initContract();

export const coreContract = c.router(
  {
    entities: coreEntitiesContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type CoreRestContract = typeof coreContract;
