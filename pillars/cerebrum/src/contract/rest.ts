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

import { cerebrumDebriefContract } from './rest-debrief.js';
import { cerebrumEgoContract } from './rest-ego.js';
import { cerebrumEmbeddingsContract } from './rest-embeddings.js';
import { cerebrumEmitContract } from './rest-emit.js';
import { cerebrumEngramsContract } from './rest-engrams.js';
import { cerebrumGliaContract } from './rest-glia.js';
import { cerebrumIndexContract } from './rest-index.js';
import { cerebrumIngestContract } from './rest-ingest.js';
import { cerebrumNudgesContract } from './rest-nudges.js';
import { cerebrumPlexusContract } from './rest-plexus.js';
import { cerebrumQueryContract } from './rest-query.js';
import { cerebrumReflexContract } from './rest-reflex.js';
import { cerebrumRetrievalContract } from './rest-retrieval.js';
import { cerebrumScopesContract } from './rest-scopes.js';
import { cerebrumTagsContract } from './rest-tags.js';
import { cerebrumTemplatesContract } from './rest-templates.js';
import { cerebrumWorkersContract } from './rest-workers.js';

const c = initContract();

export const cerebrumContract = c.router(
  {
    templates: cerebrumTemplatesContract,
    reflex: cerebrumReflexContract,
    plexus: cerebrumPlexusContract,
    engrams: cerebrumEngramsContract,
    scopes: cerebrumScopesContract,
    tags: cerebrumTagsContract,
    glia: cerebrumGliaContract,
    nudges: cerebrumNudgesContract,
    ingest: cerebrumIngestContract,
    index: cerebrumIndexContract,
    retrieval: cerebrumRetrievalContract,
    ego: cerebrumEgoContract,
    workers: cerebrumWorkersContract,
    emit: cerebrumEmitContract,
    query: cerebrumQueryContract,
    embeddings: cerebrumEmbeddingsContract,
    debrief: cerebrumDebriefContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type CerebrumRestContract = typeof cerebrumContract;
