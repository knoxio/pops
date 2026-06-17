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
import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { foodContract } from '../contract/rest.js';
import { type FoodApiDeps, makeRequestHandler } from './handlers.js';
import { serveHeroImage } from './modules/hero-image/serve.js';
import { makeFoodRestHandlers } from './rest/handlers.js';

/**
 * JSON body cap. Recipe / ingest uploads arrive as base64 strings in the
 * body; a 10 MiB file is ~13.7 MB of base64, so the limit sits above that
 * (express defaults to 100 kb, which would reject every upload).
 */
const JSON_BODY_LIMIT = '20mb';

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

  // Binary hero-image serving — registered before the ts-rest endpoints so
  // `…/hero.jpg` resolves to a file; falls through to ts-rest otherwise.
  app.get('/recipes/:recipeId/:filename', serveHeroImage);

  createExpressEndpoints(foodContract, makeFoodRestHandlers(deps), app);

  return app;
}
