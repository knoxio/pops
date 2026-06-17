/**
 * REST contract for the cerebrum pillar — ts-rest single source of truth.
 *
 * Composes the per-domain sub-routers into the public wire surface.
 * `generateOpenApi(cerebrumContract, …)` projects this to
 * `openapi/cerebrum.openapi.json`; `openapi-typescript` then projects the
 * JSON to `src/contract/api-types.generated.ts`.
 *
 * Lego principle: this is the ONLY description of the cerebrum wire format.
 * Don't hand-author OpenAPI or hand-author paths anywhere else. Domains are
 * added here as each migration slice lands.
 */
import { initContract } from '@ts-rest/core';

import { cerebrumPlexusContract } from './rest-plexus.js';
import { cerebrumReflexContract } from './rest-reflex.js';
import { cerebrumTemplatesContract } from './rest-templates.js';

const c = initContract();

export const cerebrumContract = c.router(
  {
    templates: cerebrumTemplatesContract,
    reflex: cerebrumReflexContract,
    plexus: cerebrumPlexusContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type CerebrumRestContract = typeof cerebrumContract;
