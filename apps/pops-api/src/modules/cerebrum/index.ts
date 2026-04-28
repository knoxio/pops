/**
 * Cerebrum domain — engram storage and retrieval.
 * See docs/themes/06-cerebrum for the full spec.
 */
import { router } from '../../trpc.js';
import { emitRouter } from './emit/router.js';
import { engramsRouter } from './engrams/router.js';
import { scopesRouter } from './engrams/scopes-router.js';
import { ingestRouter } from './ingest/router.js';
import { nudgesRouter } from './nudges/router.js';
import { queryRouter } from './query/router.js';
import { retrievalRouter } from './retrieval/router.js';
import { templatesRouter } from './templates/router.js';
import { indexRouter } from './thalamus/router.js';

export const cerebrumRouter = router({
  engrams: engramsRouter,
  scopes: scopesRouter,
  templates: templatesRouter,
  index: indexRouter,
  retrieval: retrievalRouter,
  ingest: ingestRouter,
  query: queryRouter,
  emit: emitRouter,
  nudges: nudgesRouter,
});
