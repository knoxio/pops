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

import type { ModuleManifest } from '@pops/types';

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

/** PRD-098 manifest. Metadata-only; consumed by the PRD-100 loader. */
export const manifest: ModuleManifest<typeof cerebrumRouter> = {
  id: 'cerebrum',
  name: 'Cerebrum',
  version: '0.1.0',
  surfaces: ['app'],
  description:
    'Engram storage, retrieval, ingest/emit, plexus, reflex, glia — knowledge graph and agents.',
  backend: { router: cerebrumRouter },
  settings: cerebrumManifest,
};
