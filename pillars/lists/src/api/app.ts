/**
 * Express app factory for the lists pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { listsContract } from '../contract/rest.js';
import { type ListsApiDeps, makeRequestHandler } from './handlers.js';
import { makeListsRestHandlers } from './rest/handlers.js';

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

  createExpressEndpoints(listsContract, makeListsRestHandlers(deps), app);

  return app;
}
