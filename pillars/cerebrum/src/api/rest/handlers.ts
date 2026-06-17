/**
 * ts-rest handler composer for the cerebrum pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<CerebrumRestContract>` that `createExpressEndpoints`
 * consumes in `app.ts`. Domains are added here as each migration slice lands.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumContract } from '../../contract/rest.js';
import { AnthropicEgoLlm } from '../modules/ego/llm.js';
import { AnthropicGenerationLlm } from '../modules/emit/llm.js';
import { resolveGliaConfigPath } from '../modules/glia/instance.js';
import { AnthropicIngestLlm } from '../modules/ingest/llm.js';
import { getCurationQueue } from '../modules/ingest/queue.js';
import { AnthropicQueryLlm, AnthropicQueryStreamLlm } from '../modules/query/llm.js';
import { AnthropicContradictionDetector } from '../modules/workers/llm.js';
import { makeEgoHandlers } from './ego-handlers.js';
import { makeEmitHandlers } from './emit-handlers.js';
import { makeEngramsHandlers } from './engrams-handlers.js';
import { makeGliaHandlers } from './glia-handlers.js';
import { makeIngestHandlers } from './ingest-handlers.js';
import { makeNudgesHandlers } from './nudges-handlers.js';
import { makePlexusHandlers } from './plexus-handlers.js';
import { makeQueryHandlers } from './query-handlers.js';
import { makeReflexHandlers } from './reflex-handlers.js';
import { makeRetrievalHandlers } from './retrieval-handlers.js';
import { makeScopesHandlers } from './scopes-handlers.js';
import { makeTagsHandlers } from './tags-handlers.js';
import { makeTemplatesHandlers } from './templates-handlers.js';
import { makeWorkersHandlers } from './workers-handlers.js';

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
    nudges: makeNudgesHandlers(deps.cerebrumDb.db),
    ingest: makeIngestHandlers({
      db: deps.cerebrumDb.db,
      engramRoot: deps.engramRoot,
      templates: deps.templateRegistry,
      llm: deps.ingestLlm ?? new AnthropicIngestLlm(),
      curationQueue: deps.curationQueue ?? getCurationQueue,
    }),
    retrieval: makeRetrievalHandlers({
      db: deps.cerebrumDb.db,
      raw: deps.cerebrumDb.raw,
      vecAvailable: deps.cerebrumDb.vecAvailable,
      peers: deps.peerClients,
      embeddingClient: deps.embeddingClient,
    }),
    ego: makeEgoHandlers({
      db: deps.cerebrumDb.db,
      raw: deps.cerebrumDb.raw,
      vecAvailable: deps.cerebrumDb.vecAvailable,
      engramRoot: deps.engramRoot,
      templates: deps.templateRegistry,
      llm: deps.egoLlm ?? new AnthropicEgoLlm(),
      peers: deps.peerClients,
      embeddingClient: deps.embeddingClient,
    }),
    workers: makeWorkersHandlers({
      db: deps.cerebrumDb.db,
      raw: deps.cerebrumDb.raw,
      vecAvailable: deps.cerebrumDb.vecAvailable,
      engramRoot: deps.engramRoot,
      templates: deps.templateRegistry,
      peers: deps.peerClients,
      embeddingClient: deps.embeddingClient,
      contradictionDetector:
        deps.auditorContradictionDetector ?? new AnthropicContradictionDetector(),
    }),
    emit: makeEmitHandlers({
      db: deps.cerebrumDb.db,
      raw: deps.cerebrumDb.raw,
      vecAvailable: deps.cerebrumDb.vecAvailable,
      peers: deps.peerClients,
      embeddingClient: deps.embeddingClient,
      llm: deps.emitLlm ?? new AnthropicGenerationLlm(),
    }),
    query: makeQueryHandlers({
      db: deps.cerebrumDb.db,
      raw: deps.cerebrumDb.raw,
      vecAvailable: deps.cerebrumDb.vecAvailable,
      peers: deps.peerClients,
      embeddingClient: deps.embeddingClient,
      llm: deps.queryLlm ?? new AnthropicQueryLlm(),
      streamLlm: deps.queryStreamLlm ?? new AnthropicQueryStreamLlm(),
    }),
  });
}
