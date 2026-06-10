/**
 * Express app factory for the food pillar container.
 *
 * Phase 3 PR 1 of the food pillar migration scaffolds the minimal
 * `/health` + `/pillars` surface so the new container can be wired
 * into docker-compose and Watchtower without depending on the
 * (still-unfinished) tRPC + URI-dispatcher migration. Subsequent PRs
 * mount the URI dispatcher and pillar tRPC routers. Kept as a factory
 * so the test suite can spin up an in-process `supertest` instance
 * without binding a real port.
 */
import express, { type Express, type Request, type Response } from 'express';

import { type FoodApiDeps, makeRequestHandler } from './handlers.js';

export function createFoodApiApp(deps: FoodApiDeps): Express {
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
