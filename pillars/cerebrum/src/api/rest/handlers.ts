/**
 * ts-rest handler composer for the cerebrum pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<CerebrumRestContract>` that `createExpressEndpoints`
 * consumes in `app.ts`. Domains are added here as each migration slice lands.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumContract } from '../../contract/rest.js';
import { makeTemplatesHandlers } from './templates-handlers.js';

import type { CerebrumApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeCerebrumRestHandlers(
  deps: CerebrumApiDeps
): ReturnType<typeof server.router<typeof cerebrumContract>> {
  return server.router(cerebrumContract, {
    templates: makeTemplatesHandlers(deps.templateRegistry),
  });
}
