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
import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { cerebrumContract } from '../contract/rest.js';
import { type CerebrumApiDeps, makeRequestHandler } from './handlers.js';
import { makeCerebrumRestHandlers } from './rest/handlers.js';

/**
 * JSON body cap. Ingest/emit payloads and (later) chat bodies can be large;
 * the limit sits well above express's 100 kb default.
 */
const JSON_BODY_LIMIT = '20mb';

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

  createExpressEndpoints(cerebrumContract, makeCerebrumRestHandlers(deps), app);

  return app;
}
