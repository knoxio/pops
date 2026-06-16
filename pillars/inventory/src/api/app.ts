/**
 * Express app factory for the inventory pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 *
 * The pillar trusts the docker network — the dispatcher/gateway in front
 * authenticates; there is no per-request auth here (parity with lists).
 */
import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { inventoryContract } from '../contract/rest.js';
import { type InventoryApiDeps, makeRequestHandler } from './handlers.js';
import { makeInventoryRestHandlers } from './rest/handlers.js';

/**
 * JSON body cap. Photo / document uploads arrive as base64 strings in the
 * body; a 10 MiB file is ~13.7 MB of base64, so the limit sits above that
 * (express defaults to 100 kb, which would reject every upload).
 */
const JSON_BODY_LIMIT = '20mb';

export function createInventoryApiApp(deps: InventoryApiDeps): Express {
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

  createExpressEndpoints(inventoryContract, makeInventoryRestHandlers(deps), app);

  return app;
}
