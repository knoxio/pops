/**
 * ts-rest handler composer for the cerebrum pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<CerebrumRestContract>` that `createExpressEndpoints`
 * consumes in `app.ts`. The map is split into a `core` group (plain DB-backed
 * domains) and an `ai` group (retrieval + the LLM-backed domains that share the
 * vector-search dep bundle) so neither builder trips the per-function line cap.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumContract } from '../../contract/rest.js';
import { AnthropicEgoLlm } from '../modules/ego/llm.js';
import { AnthropicGenerationLlm } from '../modules/emit/llm.js';
import { resolveGliaConfigPath } from '../modules/glia/instance.js';
import { AnthropicIngestLlm } from '../modules/ingest/llm.js';
import { getCurationQueue } from '../modules/ingest/queue.js';
import { AnthropicQueryLlm, AnthropicQueryStreamLlm } from '../modules/query/llm.js';
import { getEmbeddingsQueue } from '../modules/thalamus/queue.js';
import { AnthropicContradictionDetector } from '../modules/workers/llm.js';
import { makeEgoHandlers } from './ego-handlers.js';
import { makeEmitHandlers } from './emit-handlers.js';
import { makeEngramsHandlers } from './engrams-handlers.js';
import { makeGliaHandlers } from './glia-handlers.js';
import { makeIndexHandlers } from './index-handlers.js';
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
  const db = deps.cerebrumDb.db;
  const engramDeps = { db, engramRoot: deps.engramRoot, templates: deps.templateRegistry };
  const base = {
    db,
    raw: deps.cerebrumDb.raw,
    vecAvailable: deps.cerebrumDb.vecAvailable,
    peers: deps.peerClients,
    embeddingClient: deps.embeddingClient,
  };
  return server.router(cerebrumContract, {
    templates: makeTemplatesHandlers(deps.templateRegistry),
    reflex: makeReflexHandlers(deps.reflexService),
    plexus: makePlexusHandlers(db),
    engrams: makeEngramsHandlers(engramDeps),
    scopes: makeScopesHandlers(engramDeps),
    tags: makeTagsHandlers(db),
    glia: makeGliaHandlers({
      ...engramDeps,
      configPath: deps.gliaConfigPath ?? resolveGliaConfigPath(),
    }),
    nudges: makeNudgesHandlers(db),
    retrieval: makeRetrievalHandlers(base),
    ingest: makeIngestHandlers({
      ...engramDeps,
      llm: deps.ingestLlm ?? new AnthropicIngestLlm(),
      curationQueue: deps.curationQueue ?? getCurationQueue,
    }),
    index: makeIndexHandlers({
      ...engramDeps,
      peers: deps.peerClients,
      queueAccessor: deps.embeddingsQueue ?? getEmbeddingsQueue,
    }),
    emit: makeEmitHandlers({ ...base, llm: deps.emitLlm ?? new AnthropicGenerationLlm() }),
    query: makeQueryHandlers({
      ...base,
      llm: deps.queryLlm ?? new AnthropicQueryLlm(),
      streamLlm: deps.queryStreamLlm ?? new AnthropicQueryStreamLlm(),
    }),
    ego: makeEgoHandlers({
      ...base,
      engramRoot: deps.engramRoot,
      templates: deps.templateRegistry,
      llm: deps.egoLlm ?? new AnthropicEgoLlm(),
    }),
    workers: makeWorkersHandlers({
      ...base,
      engramRoot: deps.engramRoot,
      templates: deps.templateRegistry,
      contradictionDetector:
        deps.auditorContradictionDetector ?? new AnthropicContradictionDetector(),
    }),
  });
}
