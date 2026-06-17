/**
 * ts-rest handler composer for the cerebrum pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<CerebrumRestContract>` that `createExpressEndpoints`
 * consumes in `app.ts`. Domains are added here as each migration slice lands.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumContract } from '../../contract/rest.js';
import { resolveGliaConfigPath } from '../modules/glia/instance.js';
import { makeEngramsHandlers } from './engrams-handlers.js';
import { makeGliaHandlers } from './glia-handlers.js';
import { makePlexusHandlers } from './plexus-handlers.js';
import { makeReflexHandlers } from './reflex-handlers.js';
import { makeScopesHandlers } from './scopes-handlers.js';
import { makeTagsHandlers } from './tags-handlers.js';
import { makeTemplatesHandlers } from './templates-handlers.js';

import type { CerebrumApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeCerebrumRestHandlers(
  deps: CerebrumApiDeps
): ReturnType<typeof server.router<typeof cerebrumContract>> {
  const engramDeps = {
    db: deps.cerebrumDb.db,
    engramRoot: deps.engramRoot,
    templates: deps.templateRegistry,
  };
  return server.router(cerebrumContract, {
    templates: makeTemplatesHandlers(deps.templateRegistry),
    reflex: makeReflexHandlers(deps.reflexService),
    plexus: makePlexusHandlers(deps.cerebrumDb.db),
    engrams: makeEngramsHandlers(engramDeps),
    scopes: makeScopesHandlers(engramDeps),
    tags: makeTagsHandlers(deps.cerebrumDb.db),
    glia: makeGliaHandlers({
      db: deps.cerebrumDb.db,
      engramRoot: deps.engramRoot,
      templates: deps.templateRegistry,
      configPath: deps.gliaConfigPath ?? resolveGliaConfigPath(),
    }),
  });
}
