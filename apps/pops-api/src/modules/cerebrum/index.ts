/**
 * Cerebrum domain — engram storage and retrieval.
 * See docs/themes/06-cerebrum for the full spec.
 */
import { settingsRegistry } from '../core/settings/index.js';
import { cerebrumManifest } from './settings-manifest.js';

settingsRegistry.register(cerebrumManifest);

import { mergeRouters, router } from '../../trpc.js';
import { emitRouter } from './emit/router.js';
import { engramsRouter } from './engrams/router.js';
import { scopesRouter } from './engrams/scopes-router.js';
import { gliaRouter as gliaTrustRouter } from './glia/router.js';
import { ingestRouter } from './ingest/router.js';
import { nudgesRouter } from './nudges/router.js';
import { plexusRouter } from './plexus/router.js';
import { queryRouter } from './query/router.js';
import { reflexRouter } from './reflex/router.js';
import { retrievalRouter } from './retrieval/router.js';
import { templatesRouter } from './templates/router.js';
import { indexRouter } from './thalamus/router.js';
import { gliaRouter as gliaWorkersRouter } from './workers/router.js';

export const cerebrumRouter = router({
  engrams: engramsRouter,
  scopes: scopesRouter,
  templates: templatesRouter,
  index: indexRouter,
  retrieval: retrievalRouter,
  ingest: ingestRouter,
  query: queryRouter,
  emit: emitRouter,
  glia: mergeRouters(gliaTrustRouter, gliaWorkersRouter),
  nudges: nudgesRouter,
  plexus: plexusRouter,
  reflex: reflexRouter,
});
