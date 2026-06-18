/**
 * Express app factory for the lists pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { listsContract } from '../contract/rest.js';
import { type ListsApiDeps, makeRequestHandler } from './handlers.js';
import { makeListsRestHandlers } from './rest/handlers.js';

/**
 * The committed OpenAPI projection (`pillars/lists/openapi/lists.openapi.json`),
 * served verbatim at `GET /openapi` so the pillar SDK can build its route map
 * from the live pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/lists.openapi.json` lands at
 * the package root in BOTH layouts: `src/api/app.ts` (dev) and `dist/api/app.js`
 * (prod, `outDir: dist` / `rootDir: src`), since `openapi/` is a sibling of both
 * `src/` and `dist/`.
 *
 * This is a RAW route, NOT a ts-rest contract route, so it does not appear in
 * the generated document (`generate:openapi` is a pure projection of the
 * contract) — no drift. Read once at module load: the file is static.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'lists.openapi.json'),
    'utf8'
  )
);

export function createListsApiApp(deps: ListsApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

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

  createExpressEndpoints(listsContract, makeListsRestHandlers(deps), app);

  return app;
}
