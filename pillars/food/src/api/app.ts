/**
 * Express app factory for the food pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest` instance
 * without binding a real port.
 *
 * The pillar trusts the docker network — the dispatcher/gateway in front
 * authenticates; there is no per-request auth here (parity with
 * lists/inventory).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { foodContract } from '../contract/rest.js';
import { type FoodApiDeps, makeRequestHandler } from './handlers.js';
import { serveHeroImage } from './modules/hero-image/serve.js';
import { makeServeIngestScreenshot, makeServeIngestVideo } from './modules/ingest/serve.js';
import { makeFoodRestHandlers } from './rest/handlers.js';

/**
 * JSON body cap. Recipe / ingest uploads arrive as base64 strings in the
 * body; a 10 MiB file is ~13.7 MB of base64, so the limit sits above that
 * (express defaults to 100 kb, which would reject every upload).
 */
const JSON_BODY_LIMIT = '20mb';

/**
 * The committed OpenAPI projection (`pillars/food/openapi/food.openapi.json`),
 * served verbatim at `GET /openapi` so the pillar SDK can build its route map
 * from the live pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/food.openapi.json` lands at
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
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'food.openapi.json'),
    'utf8'
  )
);

/**
 * Endpoints the food worker calls back on — gated by the shared internal
 * token. Everything else trusts the docker network (the dispatcher in front
 * authenticates user traffic).
 */
const INTERNAL_PATHS = new Set(['/ai/log-inference', '/ingest/worker-complete']);

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_PATHS.has(req.path)) {
    next();
    return;
  }
  const expected = process.env['POPS_API_INTERNAL_TOKEN'];
  if (expected === undefined || req.headers['x-pops-internal-token'] !== expected) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  next();
}

export function createFoodApiApp(deps: FoodApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(requireInternalToken);

  // Build the handler shape once at factory time so static deps don't
  // get re-allocated on every request.
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

  // Binary hero-image serving — registered before the ts-rest endpoints so
  // `…/hero.jpg` resolves to a file; falls through to ts-rest otherwise.
  app.get('/recipes/:recipeId/:filename', serveHeroImage);

  // Binary ingest-media serving (screenshot/video) for the inbox UI. GET-only
  // and on a distinct subpath, so no collision with the POST `ingest.*` API.
  app.get('/ingest/source/:sourceId/screenshot', makeServeIngestScreenshot(deps.foodDb.db));
  app.get('/ingest/source/:sourceId/video', makeServeIngestVideo(deps.foodDb.db));

  createExpressEndpoints(foodContract, makeFoodRestHandlers(deps), app);

  return app;
}
