/**
 * Express app factory for the inventory pillar container.
 *
 * Phase 3 PR 1 of the inventory pillar migration scaffolds the minimal
 * `/health` + `/pillars` surface. Subsequent PRs add the URI dispatcher
 * (`POST /uri/resolve`) and tRPC routers. Kept as a factory so the test
 * suite can spin up an in-process `supertest` instance without binding
 * a real port.
 */
import express, { type Express, type Request, type Response } from 'express';

import { type InventoryApiDeps, makeRequestHandler } from './handlers.js';

export function createInventoryApiApp(deps: InventoryApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Build the handler shape once at factory time so static deps don't
  // get re-allocated on every request.
  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response) => {
    res.json(handlers.pillars());
  });

  return app;
}
