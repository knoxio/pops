/**
 * Express app factory for the cerebrum pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest` instance
 * without binding a real port.
 *
 * The pillar trusts the docker network for the non-identity domains migrated
 * so far (templates). Identity-dependent domains (ego/retrieval/query/ingest)
 * land in later slices behind the pillar auth middleware.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { cerebrumContract } from '../contract/rest.js';
import { type CerebrumApiDeps, makeRequestHandler } from './handlers.js';
import { AnthropicEgoLlm } from './modules/ego/llm.js';
import { AnthropicQueryLlm, AnthropicQueryStreamLlm } from './modules/query/llm.js';
import { makeEgoStreamRouter } from './rest/ego-stream.js';
import { makeCerebrumRestHandlers } from './rest/handlers.js';
import { makeQueryStreamHandler } from './rest/query-stream-route.js';

/**
 * JSON body cap. Ingest/emit payloads and (later) chat bodies can be large;
 * the limit sits well above express's 100 kb default.
 */
const JSON_BODY_LIMIT = '20mb';

/**
 * The committed OpenAPI projection (`pillars/cerebrum/openapi/cerebrum.openapi.json`),
 * served verbatim at `GET /openapi` so the pillar SDK can build its route map
 * from the live pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/cerebrum.openapi.json` lands
 * at the package root in BOTH layouts: `src/api/app.ts` (dev) and
 * `dist/api/app.js` (prod, `outDir: dist` / `rootDir: src`), since `openapi/`
 * is a sibling of both `src/` and `dist/`.
 *
 * This is a RAW route, NOT a ts-rest contract route, so it does not appear in
 * the generated document (`generate:openapi` is a pure projection of the
 * contract) — no drift. Read once at module load: the file is static.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'cerebrum.openapi.json'),
    'utf8'
  )
);

export function createCerebrumApiApp(deps: CerebrumApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response) => {
    res.json(handlers.pillars());
  });

  // Self-describing OpenAPI surface. Serves the committed projection verbatim
  // so a sibling pillar / the pillar SDK can build its operationId route map
  // against the live pillar. Raw route — intentionally NOT a ts-rest contract
  // route, so it never appears in the generated document.
  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  // The ego SSE route (`text/event-stream`) can't be modelled in ts-rest, so it
  // mounts as a plain Express route BEFORE createExpressEndpoints.
  app.use(
    makeEgoStreamRouter({
      db: deps.cerebrumDb.db,
      raw: deps.cerebrumDb.raw,
      vecAvailable: deps.cerebrumDb.vecAvailable,
      engramRoot: deps.engramRoot,
      templates: deps.templateRegistry,
      llm: deps.egoLlm ?? new AnthropicEgoLlm(),
      peers: deps.peerClients,
      embeddingClient: deps.embeddingClient,
    })
  );

  // SSE: ts-rest can't model an event stream, so the query stream route is a
  // plain Express handler mounted ahead of the generated endpoints.
  app.post(
    '/query/stream',
    makeQueryStreamHandler({
      db: deps.cerebrumDb.db,
      raw: deps.cerebrumDb.raw,
      vecAvailable: deps.cerebrumDb.vecAvailable,
      peers: deps.peerClients,
      embeddingClient: deps.embeddingClient,
      llm: deps.queryLlm ?? new AnthropicQueryLlm(),
      streamLlm: deps.queryStreamLlm ?? new AnthropicQueryStreamLlm(),
    })
  );

  createExpressEndpoints(cerebrumContract, makeCerebrumRestHandlers(deps), app);

  return app;
}
